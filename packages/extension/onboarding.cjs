const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { createHash } = require("node:crypto");
const { spawn } = require("node:child_process");
const { createConnection } = require("node:net");
const setup = require("./workspace.cjs");
function register(vscode, context) {
  let child,
    socket = "",
    stopping;
  const output = vscode.window.createOutputChannel("ApprovalLens setup");
  context.subscriptions.push(output);
  function workspace() {
    if (!vscode.workspace.isTrusted)
      throw Error("Trust the workspace before enabling ApprovalLens");
    const folders = vscode.workspace.workspaceFolders || [];
    if (folders.length !== 1 || folders[0].uri.scheme !== "file")
      throw Error(
        "Open one local folder; multi-root and remote workspaces are not supported yet",
      );
    if (process.platform === "win32")
      throw Error("This release supports macOS and Linux");
    return fs.realpathSync(folders[0].uri.fsPath);
  }
  const stateFor = (root) =>
    path.join(
      os.homedir(),
      ".approvallens",
      createHash("sha256").update(root).digest("hex").slice(0, 16),
    );
  const secretKey = (root) => `access:${root}`;
  async function stop() {
    socket = "";
    if (!child) return;
    const old = child;
    child = undefined;
    stopping = new Promise((resolve) => {
      old.once("exit", resolve);
      old.kill();
      setTimeout(resolve, 3000);
    });
    await stopping;
  }
  async function start(root) {
    await stop();
    const state = stateFor(root),
      target = path.join(state, "service.sock");
    const token = await context.secrets.get(secretKey(root));
    // Never delete a socket unless it is proven stale. A second editor window
    // must not replace an active service or inherit its pending approvals.
    if (fs.existsSync(target)) {
      await new Promise((resolve, reject) => {
        const client = createConnection(target);
        client.once("connect", () => {
          client.destroy();
          reject(
            Error("Another ApprovalLens service is active for this workspace"),
          );
        });
        client.once("error", (error) => {
          if (["ECONNREFUSED", "ENOENT"].includes(error.code)) {
            fs.rmSync(target, { force: true });
            resolve();
          } else reject(error);
        });
      });
    }
    child = spawn(
      process.execPath,
      [
        path.join(context.extensionPath, "dist/companion.cjs"),
        path.join(state, "config.json"),
        state,
      ],
      {
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: "1",
          ...(token ? { APPROVALLENS_ACCESS_TOKEN: token } : {}),
        },
        stdio: ["pipe", "ignore", "pipe"],
      },
    );
    const current = child;
    current.stderr.on("data", (data) => output.appendLine(data.toString()));
    current.on("error", () =>
      output.appendLine("Companion could not start. Use Check setup."),
    );
    current.on("exit", () => {
      if (child === current) {
        child = undefined;
        socket = "";
      }
    });
    for (let n = 0; n < 50; n++) {
      if (fs.existsSync(target)) {
        socket = target;
        return;
      }
      if (current.exitCode !== null)
        throw Error("Companion exited; see ApprovalLens setup output");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    await stop();
    throw Error("Companion did not become ready");
  }
  function parsePolicy(root) {
    const { IntegrationPolicy } = require("./dist/policy.cjs");
    const file = setup.workspaceFiles(root).rules;
    return IntegrationPolicy.parse(setup.read(file, setup.starterPolicy()));
  }
  async function enable() {
    const root = workspace(),
      policy = parsePolicy(root);
    const answer = await vscode.window.showWarningMessage(
      "Enable ApprovalLens for this workspace?",
      {
        modal: true,
        detail:
          "Adds project hooks and a public MCP connection, and starts a bundled local companion. Exact grants only; unsupported hooked tools are denied. Rules-only initially: no repository evidence is sent remotely. Read the rules before allowing changes.",
      },
      "Enable",
    );
    if (answer !== "Enable") return;
    await stop();
    setup.configure({
      root,
      state: stateFor(root),
      runtime: process.execPath,
      extensionPath: context.extensionPath,
      policy,
    });
    await context.workspaceState.update("approvallens.enabled", true);
    await start(root);
    await vscode.window.showTextDocument(
      vscode.Uri.file(setup.workspaceFiles(root).rules),
    );
    vscode.window.showInformationMessage(
      "ApprovalLens enabled. Edit exact grants and intent, then run Apply rules. Use Connect hosted review to enable Nemotron. Cursor may ask you to enable the added MCP server.",
    );
  }
  async function apply() {
    const root = workspace(),
      policy = parsePolicy(root);
    const answer = await vscode.window.showWarningMessage(
      "Apply these rules to the active guard?",
      { modal: true, detail: JSON.stringify(policy, null, 2) },
      "Apply rules",
    );
    if (answer !== "Apply rules") return;
    const state = stateFor(root),
      current = setup.read(path.join(state, "config.json"), {});
    await stop();
    setup.configure({
      root,
      state,
      runtime: process.execPath,
      extensionPath: context.extensionPath,
      policy,
      live: current.semantic?.mode === "live",
    });
    await start(root);
  }
  async function connect() {
    const root = workspace(),
      state = stateFor(root);
    if (!context.workspaceState.get("approvallens.enabled"))
      throw Error("Enable this workspace first");
    const agree = await vscode.window.showWarningMessage(
      "Enable hosted Nemotron review?",
      {
        modal: true,
        detail:
          "Eligible actions send intent, explanation, paths and policy-disclosed JSON field evidence to ApprovalLens on Vercel and Nebius. Raw write bodies are omitted. The access token uses a shared limited pilot budget; this is not unlimited public service. Required remote failures deny the action.",
      },
      "Connect",
    );
    if (agree !== "Connect") return;
    const token = await vscode.window.showInputBox({
      password: true,
      ignoreFocusOut: true,
      prompt: "ApprovalLens access token (not your Nebius API key)",
    });
    if (!token?.trim()) return;
    const response = await fetch(
      "https://approvallens-release.vercel.app/api/mcp",
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(15000),
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: "Bearer " + token.trim(),
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      },
    );
    if (!response.ok)
      throw Error("Access token rejected or hosted service unavailable");
    const listing = await response.json();
    if (
      !listing.result?.tools?.some(
        (tool) => tool.name === "approvallens_review_evidence",
      )
    )
      throw Error("Hosted service does not support native evidence review yet");
    await context.secrets.store(secretKey(root), token.trim());
    const config = setup.read(path.join(state, "config.json"));
    await stop();
    config.semantic.mode = "live";
    setup.write(path.join(state, "config.json"), config);
    // Explicit reconnect clears a failure halt, never the server's budget.
    fs.rmSync(path.join(state, "remote-halted"), { force: true });
    await start(root);
    vscode.window.showInformationMessage(
      "Hosted review configured. Credential and remote capability verified; no model call was made during setup.",
    );
  }
  async function disable() {
    const root = workspace();
    const answer = await vscode.window.showWarningMessage(
      "Disable ApprovalLens for this workspace?",
      {
        modal: true,
        detail:
          "Removes ApprovalLens-owned hooks and MCP entry. Native tools will no longer be guarded by ApprovalLens.",
      },
      "Disable",
    );
    if (answer !== "Disable") return;
    setup.disable(root, stateFor(root));
    await stop();
    await context.workspaceState.update("approvallens.enabled", false);
  }
  const commands = {
    enable,
    applyRules: apply,
    connect,
    disable,
    openRules: async () => {
      const root = workspace();
      await vscode.window.showTextDocument(
        vscode.Uri.file(setup.workspaceFiles(root).rules),
      );
    },
    checkSetup: async () => {
      const root = workspace();
      output.show();
      output.appendLine(
        `Workspace: ${root}\nEnabled: ${!!context.workspaceState.get("approvallens.enabled")}\nCompanion: ${socket ? "running" : "not running"}\nCoverage: Cursor hook-delivered calls only; search coverage is not guaranteed.\nActive rules: ${path.join(stateFor(root), "config.json")}\nEditable rules: ${setup.workspaceFiles(root).rules}`,
      );
    },
  };
  for (const [name, handler] of Object.entries(commands))
    context.subscriptions.push(
      vscode.commands.registerCommand(`approvallens.${name}`, () =>
        handler().catch((e) =>
          vscode.window.showErrorMessage(`ApprovalLens: ${e.message}`),
        ),
      ),
    );
  if (context.workspaceState.get("approvallens.enabled"))
    void (async () => {
      const root = workspace(),
        state = stateFor(root),
        config = setup.read(path.join(state, "config.json"));
      // Rebind extension paths after upgrades; use the previously applied policy,
      // never silently accept agent edits to the workspace rules file.
      setup.configure({
        root,
        state,
        runtime: process.execPath,
        extensionPath: context.extensionPath,
        policy: config.policy,
        live: config.semantic.mode === "live",
      });
      await start(root);
    })().catch((e) =>
      vscode.window.showErrorMessage(`ApprovalLens: ${e.message}`),
    );
  context.subscriptions.push({
    dispose: () => {
      if (child) child.kill();
    },
  });
  return { socketPath: () => socket };
}
module.exports = { register };
