const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const ENDPOINT = "https://approvallens-release.vercel.app/api/mcp";
const EVENTS = ["preToolUse", "postToolUse", "postToolUseFailure"];
const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
function safePath(root, relative) {
  let current = root;
  for (const part of relative.split("/")) {
    current = path.join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink())
      throw Error("Refusing symlink configuration path");
  }
  return current;
}
function read(file, fallback) {
  return fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, "utf8"))
    : fallback;
}
function write(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file + ".al-tmp", JSON.stringify(data, null, 2) + "\n", {
    mode: 0o600,
  });
  fs.renameSync(file + ".al-tmp", file);
}
function workspaceFiles(root) {
  return {
    hooks: safePath(root, ".cursor/hooks.json"),
    mcp: safePath(root, ".cursor/mcp.json"),
    rules: safePath(root, ".approvallens/rules.json"),
  };
}
function starterPolicy() {
  return {
    version: 1,
    taskId: "workspace-review",
    developerIntent:
      "Inspect package.json. Add exact operation/path grants and task intent before making changes.",
    grants: [{ operation: "read_file", path: "package.json" }],
  };
}
function configure({
  root,
  state,
  runtime,
  extensionPath,
  policy,
  live = false,
}) {
  root = fs.realpathSync(root);
  const files = workspaceFiles(root);
  const hooks = read(files.hooks, { version: 1, hooks: {} });
  const mcp = read(files.mcp, { mcpServers: {} });
  if (
    hooks.version !== 1 ||
    !hooks.hooks ||
    typeof hooks.hooks !== "object" ||
    Array.isArray(hooks.hooks)
  )
    throw Error("Unsupported hooks configuration");
  if (
    !mcp.mcpServers ||
    typeof mcp.mcpServers !== "object" ||
    Array.isArray(mcp.mcpServers)
  )
    throw Error("Unsupported MCP configuration");
  fs.mkdirSync(state, { recursive: true, mode: 0o700 });
  if (fs.lstatSync(state).isSymbolicLink())
    throw Error("State cannot be a symlink");
  const rel = path.relative(root, fs.realpathSync(state));
  if (!rel || (!rel.startsWith("..") && !path.isAbsolute(rel)))
    throw Error("Trusted state must be outside workspace");
  const socket = path.join(state, "service.sock");
  if (Buffer.byteLength(socket) > 100)
    throw Error("Companion socket path is too long");
  const manifestPath = path.join(state, "installation.json");
  const previous = read(manifestPath, {});
  const entry = { url: ENDPOINT };
  if (
    mcp.mcpServers.approvallens &&
    JSON.stringify(mcp.mcpServers.approvallens) !==
      JSON.stringify(previous.mcp || entry)
  )
    throw Error(
      "Existing approvallens MCP entry conflicts; rename it before enabling",
    );
  const command = `ELECTRON_RUN_AS_NODE=1 ${quote(runtime)} ${quote(path.join(extensionPath, "dist/hook.mjs"))} ${quote(socket)}`;
  for (const event of EVENTS) {
    const entries = hooks.hooks[event] || [];
    if (!Array.isArray(entries)) throw Error("Invalid hook list");
    hooks.hooks[event] = [
      ...entries.filter(
        (item) => item.command !== previous.command && item.command !== command,
      ),
      {
        command,
        timeout: 120,
        ...(event === "preToolUse" ? { failClosed: true } : {}),
      },
    ];
  }
  // Validate all inputs before changing any workspace file. Save original versions for recovery.
  for (const [name, file] of Object.entries(files))
    if (name !== "rules" && fs.existsSync(file)) {
      const backup = path.join(state, `${name}-before-${Date.now()}.json`);
      fs.copyFileSync(file, backup);
    }
  write(path.join(state, "config.json"), {
    workspace: root,
    policy,
    approvalMode: "wait",
    semantic: {
      mode: live ? "live" : "rules-only",
      criticalReadPaths: [],
      maxCalls: 0,
    },
  });
  if (!fs.existsSync(files.rules)) write(files.rules, policy);
  write(files.hooks, hooks);
  mcp.mcpServers.approvallens = entry;
  write(files.mcp, mcp);
  write(manifestPath, {
    command,
    mcp: entry,
    rulesHash: crypto
      .createHash("sha256")
      .update(JSON.stringify(policy))
      .digest("hex"),
  });
  return {
    socket,
    config: path.join(state, "config.json"),
    rules: files.rules,
  };
}
function disable(root, state) {
  const files = workspaceFiles(root),
    manifest = read(path.join(state, "installation.json"), {});
  if (fs.existsSync(files.hooks)) {
    const hooks = read(files.hooks);
    for (const event of EVENTS)
      if (Array.isArray(hooks.hooks?.[event]))
        hooks.hooks[event] = hooks.hooks[event].filter(
          (item) => item.command !== manifest.command,
        );
    write(files.hooks, hooks);
  }
  if (fs.existsSync(files.mcp)) {
    const mcp = read(files.mcp);
    if (
      JSON.stringify(mcp.mcpServers?.approvallens) ===
      JSON.stringify(manifest.mcp)
    )
      delete mcp.mcpServers.approvallens;
    write(files.mcp, mcp);
  }
}
module.exports = {
  configure,
  disable,
  starterPolicy,
  workspaceFiles,
  read,
  write,
};
