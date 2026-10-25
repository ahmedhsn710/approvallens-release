import { serviceIdentity } from "../../mcp/src/identity";
import { createServer } from "node:net";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  unlinkSync,
} from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import Database from "better-sqlite3";
import { createCursorController, CursorConfig } from "./controller";
import { nativeLiveBackend } from "./live";
const [configFile, stateDir] = process.argv.slice(2);
if (!configFile || !stateDir || !isAbsolute(stateDir))
  throw Error("Usage: daemon <config.json> <absolute state directory>");
const config = CursorConfig.parse(JSON.parse(readFileSync(configFile, "utf8")));
const configRel = relative(
  realpathSync(config.workspace),
  realpathSync(configFile),
);
if (!configRel || (!configRel.startsWith("..") && !isAbsolute(configRel)))
  throw Error("Configuration must be outside inspected workspace");
mkdirSync(stateDir, { recursive: true, mode: 0o700 });
chmodSync(stateDir, 0o700);
const root = realpathSync(config.workspace),
  state = realpathSync(stateDir);
const rel = relative(root, state);
if (!rel || (!rel.startsWith("..") && !isAbsolute(rel)))
  throw Error("State must be outside inspected workspace");
const socket = resolve(state, "service.sock");
if (existsSync(socket))
  throw Error(
    "Socket exists: stop the previous service or verify it is stale before removal",
  );
const db = new Database(resolve(state, "activity.sqlite"));
db.exec(
  "CREATE TABLE IF NOT EXISTS activity (id TEXT PRIMARY KEY, at TEXT NOT NULL, row TEXT NOT NULL)",
);
const save = db.prepare("INSERT OR REPLACE INTO activity VALUES (?, ?, ?)");
const backend =
  config.semantic.mode === "live"
    ? nativeLiveBackend(db, root, config.semantic)
    : undefined;
const loadedIdentity = serviceIdentity(config.policy);
const controller = createCursorController(
  config,
  (row) => {
    save.run(row.id, row.at, JSON.stringify(row));
    db.exec(
      "DELETE FROM activity WHERE id NOT IN (SELECT id FROM activity ORDER BY at DESC LIMIT 1000)",
    );
  },
  Date.now,
  backend,
);
// On restart, pending/approved permits are invalid. Preserve the audit trail, not the authorization.
for (const item of db.prepare("SELECT id,row FROM activity").all() as {
  id: string;
  row: string;
}[]) {
  const row = JSON.parse(item.row);
  if (
    row.canApprove ||
    row.status === "approved-once" ||
    row.status === "model-review"
  ) {
    row.canApprove = false;
    row.status = "expired";
    row.reason = "Service restarted; authorization invalidated.";
    save.run(row.id, row.at, JSON.stringify(row));
  }
}
const server = createServer((client) => {
  const abort = new AbortController();
  client.on("close", () => abort.abort());
  let input = "";
  let handled = false;
  client.setTimeout(6000, () => client.destroy());
  client.on("error", () => {});
  client.on("data", async (chunk) => {
    if (handled) return;
    input += chunk.toString();
    if (Buffer.byteLength(input) > 65536) {
      client.destroy();
      return;
    }
    if (!input.includes("\n")) return;
    handled = true;
    try {
      const request = JSON.parse(input.trim());
      let result: unknown;
      controller.expire();
      if (request.method === "event") {
        client.setTimeout(110000);
        result = await controller.event(request.event, abort.signal);
      } else if (request.method === "list")
        result = {
          version: 1,
          identity: loadedIdentity,
          mode: backend ? "LIVE" : "RULES_ONLY",
          liveHalted: backend
            ? Boolean(
                db.prepare("SELECT id FROM native_live_halt WHERE id=1").get(),
              )
            : false,
          coverage:
            "Hook-delivered calls only. Built-in web search coverage is unverified.",
          workspace: root,
          events: (
            db
              .prepare("SELECT row FROM activity ORDER BY at DESC LIMIT 100")
              .all() as { row: string }[]
          ).map((item) => JSON.parse(item.row)),
        };
      else if (request.method === "inspect")
        result = controller.inspect(request.id);
      else if (request.method === "approve")
        result = controller.approve(request.id);
      else if (request.method === "reject")
        result = controller.reject(request.id);
      else throw Error("Unknown method");
      client.end(JSON.stringify({ ok: true, result }) + "\n");
    } catch {
      client.end(
        JSON.stringify({ ok: false, error: "request_rejected" }) + "\n",
      );
    }
  });
});
server.on("error", (error) => {
  console.error(
    `ApprovalLens service failed: ${(error as NodeJS.ErrnoException).code || "unknown"}`,
  );
  db.close();
  process.exitCode = 1;
});
server.listen(socket, () => {
  chmodSync(socket, 0o600);
  console.error(
    `ApprovalLens local service ready (${backend ? "LIVE" : "RULES_ONLY"}).`,
  );
});
function stop() {
  server.close();
  db.close();
  if (existsSync(socket)) unlinkSync(socket);
  process.exit(0);
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
