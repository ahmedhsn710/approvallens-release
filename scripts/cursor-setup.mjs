// Deliberate, project-local installer. Existing MCP settings and other hooks are preserved.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
const [workspaceArg, stateArg] = process.argv.slice(2);
if (!workspaceArg || !stateArg)
  throw Error(
    "Usage: node scripts/cursor-setup.mjs <workspace> <state-directory>",
  );
const workspace = realpathSync(workspaceArg);
const state = resolve(stateArg);
mkdirSync(state, { recursive: true, mode: 0o700 });
const stateReal = realpathSync(state),
  rel = relative(workspace, stateReal);
if (!rel || (!rel.startsWith("..") && !isAbsolute(rel)))
  throw Error("State must be outside the inspected workspace");
const socket = resolve(stateReal, "service.sock");
if (Buffer.byteLength(socket) > 100)
  throw Error("Choose a shorter state directory for the Unix socket");
const config = resolve(stateReal, "config.json");
if (!existsSync(config))
  writeFileSync(
    config,
    JSON.stringify(
      {
        workspace,
        approvalMode: "wait",
        policy: {
          version: 1,
          taskId: "cursor-native-development",
          developerIntent: "Review native operations in this workspace",
          grants: [],
        },
      },
      null,
      2,
    ) + "\n",
    { mode: 0o600, flag: "wx" },
  );
else if (JSON.parse(readFileSync(config, "utf8")).workspace !== workspace)
  throw Error("Existing configuration belongs to another workspace");
const folder = resolve(workspace, ".cursor");
mkdirSync(folder, { recursive: true });
const path = resolve(folder, "hooks.json");
const hooks = existsSync(path)
  ? JSON.parse(readFileSync(path, "utf8"))
  : { version: 1, hooks: {} };
if (hooks.version !== 1 || !hooks.hooks || typeof hooks.hooks !== "object")
  throw Error("Unsupported existing hook configuration");
const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
const script = fileURLToPath(new URL("./cursor-hook.mjs", import.meta.url));
const command = [process.execPath, script, socket].map(quote).join(" ");
for (const event of ["preToolUse", "postToolUse", "postToolUseFailure"]) {
  const previous = hooks.hooks[event] || [];
  if (!Array.isArray(previous)) throw Error("Invalid existing hook entry");
  hooks.hooks[event] = [
    ...previous.filter((item) => item.command !== command),
    {
      command,
      timeout: 120,
      ...(event === "preToolUse" ? { failClosed: true } : {}),
    },
  ];
}
if (existsSync(path))
  writeFileSync(`${path}.backup-${Date.now()}`, readFileSync(path), {
    flag: "wx",
  });
writeFileSync(path, JSON.stringify(hooks, null, 2) + "\n");
console.log(
  JSON.stringify(
    {
      workspace,
      config,
      socket,
      next: "Add explicit grants to config.json, start cursor-service.mjs, set the extension socketPath in user settings. Default policy denies everything.",
    },
    null,
    2,
  ),
);
