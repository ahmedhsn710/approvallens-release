import { createServer } from "node:net";
import {
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
  chmodSync,
  unlinkSync,
  realpathSync,
} from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
import {
  createCursorController,
  CursorConfig,
  type Activity,
} from "./controller";
import { remoteReviewer } from "../../mcp/src/remote-review";
import { serviceIdentity } from "../../mcp/src/identity";

// Dependency-free runtime storage: no platform-specific SQLite addon or npm install.
const [configPath, directory] = process.argv.slice(2);
const config = CursorConfig.parse(
  JSON.parse(readFileSync(configPath!, "utf8")),
);
const root = realpathSync(config.workspace),
  state = realpathSync(directory!);
for (const path of [state, realpathSync(configPath!)]) {
  const rel = relative(root, path);
  if (!rel || (!rel.startsWith("..") && !isAbsolute(rel)))
    throw Error("Trusted state must be outside workspace");
}
const socket = resolve(state, "service.sock"),
  journal = resolve(state, "activity.json");
if (existsSync(socket)) throw Error("Service socket already exists");
let rows: Activity[] = [];
if (existsSync(journal)) rows = JSON.parse(readFileSync(journal, "utf8"));
rows = rows.map((row) => ({
  ...row,
  canApprove: false,
  ...(row.canApprove
    ? {
        status: "expired",
        reason: "Service restarted; authorization invalidated.",
      }
    : {}),
}));
let halted = false;
const haltFile = resolve(state, "remote-halted");
halted = existsSync(haltFile);
const token = process.env.APPROVALLENS_ACCESS_TOKEN;
delete process.env.APPROVALLENS_ACCESS_TOKEN;
const provider = token ? remoteReviewer(token) : undefined;
const backend =
  config.semantic.mode === "live"
    ? {
        reserve: () => !halted && !!provider,
        halted: () => halted,
        reviewer: Object.assign(
          async (...args: Parameters<NonNullable<typeof provider>>) => {
            try {
              if (!provider) throw Error("Configure an access token");
              return await provider(...args);
            } catch (e) {
              halted = true;
              writeFileSync(
                haltFile,
                "Required remote review failed. Reconnect explicitly after investigating.\n",
                { mode: 0o600 },
              );
              throw e;
            }
          },
          { promptVersion: provider?.promptVersion },
        ),
      }
    : undefined;
function save(row: Activity) {
  rows = [row, ...rows.filter((r) => r.id !== row.id)].slice(0, 1000);
  writeFileSync(journal + ".tmp", JSON.stringify(rows), { mode: 0o600 });
  renameSync(journal + ".tmp", journal);
}
const controller = createCursorController(config, save, Date.now, backend);
const server = createServer((client) => {
  let raw = "",
    handled = false;
  const abort = new AbortController();
  client.on("close", () => abort.abort());
  client.on("error", () => {});
  client.setTimeout(115000, () => client.destroy());
  client.on("data", async (chunk) => {
    if (handled) return;
    raw += chunk;
    if (Buffer.byteLength(raw) > 65536) return client.destroy();
    if (!raw.includes("\n")) return;
    handled = true;
    try {
      const request = JSON.parse(raw);
      controller.expire();
      let result;
      if (request.method === "event")
        result = await controller.event(request.event, abort.signal);
      else if (request.method === "list")
        result = {
          version: 1,
          workspace: root,
          mode: backend ? "LIVE" : "RULES_ONLY",
          liveHalted: halted,
          identity: serviceIdentity(config.policy),
          events: rows.slice(0, 100),
        };
      else if (request.method === "inspect")
        result = controller.inspect(request.id);
      else if (request.method === "approve")
        result = controller.approve(request.id);
      else if (request.method === "reject")
        result = controller.reject(request.id);
      else throw Error("Unsupported request");
      client.end(JSON.stringify({ ok: true, result }) + "\n");
    } catch {
      client.end(
        JSON.stringify({ ok: false, error: "request_rejected" }) + "\n",
      );
    }
  });
});
server.on("error", () => process.exit(1));
server.listen(socket, () => {
  chmodSync(socket, 0o600);
  console.error("ApprovalLens companion ready");
});
function stop() {
  server.close();
  if (existsSync(socket)) unlinkSync(socket);
  process.exit(0);
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

// Editor termination closes the private stdin pipe; do not leave an orphan guard.
process.stdin.resume();
process.stdin.on("end", stop);
