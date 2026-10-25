/** Fresh, rules-only practice installation. Never modifies an existing project or live ledger. */
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { CursorConfig } from "../packages/companion/src/controller";

const args = process.argv.slice(2);
const profiles = ["settings", "application"];
if (
  args.length !== 3 ||
  args[1] !== "--profile" ||
  !profiles.includes(args[2]!)
) {
  throw Error(
    "Usage: npm run demo:setup -- <new-directory> --profile settings|application",
  );
}
if (Number(process.versions.node.split(".")[0]) < 24)
  throw Error("Node 24 or newer is required");
if (process.platform === "win32")
  throw Error("This release requires macOS or Linux (Unix sockets)");
const destination = resolve(args[0]!);
// Require an existing parent and refuse any existing destination, including symlinks.
const base = join(realpathSync(dirname(destination)), basename(destination));
const workspace = join(base, "project");
const state = join(base, "state");
const socket = join(state, "service.sock");
if (Buffer.byteLength(socket) > 100)
  throw Error("Choose a shorter destination for the Unix socket");
const repo = fileURLToPath(new URL("../", import.meta.url));
const source = join(repo, "examples", "cursor-demo", args[2]!);
const policy = JSON.parse(readFileSync(join(source, "policy.json"), "utf8"));
const config = CursorConfig.parse({
  workspace,
  policy,
  approvalMode: "wait",
  semantic: { mode: "rules-only", maxCalls: 0 },
});
const promptSets = {
  settings: [
    [
      "1. Allowed read",
      "Use Read to read package.json. Do not use terminal or search.",
    ],
    [
      "2. Safe write",
      'Use Write to replace settings.json with {"compilerOptions":{"strict":true,"retries":1}}. Do not use partial edits or other tools.',
    ],
    [
      "3. Protected write",
      'Use Write to replace settings.json with {"compilerOptions":{"strict":true,"retries":2}}. Do not use other tools.',
    ],
    ["4. Shell", "Use Shell to run echo ApprovalLens-demo."],
  ],
  application: [
    [
      "1. Allowed read",
      "Use Read to read package.json. Do not use terminal or search.",
    ],
    [
      "2. Safe write",
      'Use Write to replace service.json with {"network":{"timeoutSeconds":30},"security":{"requireAuthentication":true}}. Do not use partial edits or other tools.',
    ],
    [
      "3. Protected write",
      'Use Write to replace service.json with {"network":{"timeoutSeconds":30},"security":{"requireAuthentication":false}}. Do not use other tools.',
    ],
    ["4. Shell", "Use Shell to run echo ApprovalLens-demo."],
  ],
} as const;
const files = [
  "package.json",
  ...policy.evidence.map((entry: { path: string }) => entry.path),
];
const contents = files.map(
  (path) => [path, readFileSync(join(source, path), "utf8")] as const,
);
mkdirSync(base, { mode: 0o700 });
mkdirSync(workspace, { mode: 0o700 });
mkdirSync(state, { mode: 0o700 });
mkdirSync(join(workspace, ".vscode"), { mode: 0o700 });
for (const [path, content] of contents)
  writeFileSync(join(workspace, path), content, { flag: "wx", mode: 0o600 });
writeFileSync(
  join(workspace, ".vscode", "settings.json"),
  JSON.stringify({ "approvallens.socketPath": socket }, null, 2) + "\n",
  { flag: "wx", mode: 0o600 },
);
writeFileSync(
  join(workspace, ".vscode", "approvallens-prompts.json"),
  JSON.stringify(
    {
      prompts: promptSets[args[2] as "settings" | "application"].map(
        ([title, text]) => ({ title, text }),
      ),
    },
    null,
    2,
  ) + "\n",
  { flag: "wx", mode: 0o600 },
);
const configPath = join(state, "config.json");
writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", {
  flag: "wx",
  mode: 0o600,
});
const installed = spawnSync(
  process.execPath,
  [join(repo, "scripts/cursor-setup.mjs"), workspace, state],
  { encoding: "utf8" },
);
if (installed.status !== 0)
  throw Error(
    "Hook installation failed; keep this directory for inspection and retry with a new destination. " +
      installed.stderr,
  );
const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
const command = (...parts: string[]) => parts.map(quote).join(" ");
console.log(
  JSON.stringify(
    {
      profile: args[2],
      workspace,
      config: configPath,
      socket,
      mode: "rules-only",
      modelCalls: 0,
      startService: command(
        process.execPath,
        join(repo, "scripts/cursor-service.mjs"),
        configPath,
        state,
      ),
      doctor: `cd ${quote(repo)} && ${command(process.execPath, "--import", "tsx", "packages/companion/src/doctor.ts", configPath, state)}`,
      next: "Install the VSIX, start the printed local service command, then open only the project folder in Cursor and reload the window. The sample workspace already points the extension to this service socket. Open shield → Activity. See docs/JUDGE-QUICKSTART.md. No service or editor was launched.",
    },
    null,
    2,
  ),
);
