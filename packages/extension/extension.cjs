const { evidenceLines } = require("./evidence.cjs");
const { demoPrompts } = require("./prompts.cjs");
const vscode = require("vscode");
const { createConnection } = require("node:net");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const labels = {
  "needs-review": "Needs your review",
  "human-approved": "Approved",
  "policy-allowed": "Allowed by policy",
  "approved-once": "Retry approved",
  "model-review": "Nemotron reviewing…",
  "observed-only": "Observed, authorization unknown",
  blocked: "Blocked",
  rejected: "Denied",
  expired: "Expired",
};
function activate(context) {
  const folder = vscode.workspace.workspaceFolders?.[0];
  let prompts = [];
  if (folder) {
    try {
      prompts = demoPrompts(
        readFileSync(
          join(folder.uri.fsPath, ".vscode", "approvallens-prompts.json"),
          "utf8",
        ),
      );
    } catch {
      prompts = [];
    }
  }
  const changes = new vscode.EventEmitter();
  const documents = new Map();
  const seen = new Set();
  const started = Date.now();
  let rows = [],
    state = "Connecting…",
    refreshing = false,
    prompting = false,
    signature = "";
  const badge = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    30,
  );
  badge.command = "approvallens.activity.focus";
  badge.show();
  function rpc(method, id) {
    return new Promise((resolve, reject) => {
      const path = vscode.workspace
        .getConfiguration("approvallens")
        .get("socketPath");
      if (!path)
        return reject(
          Error("Configure ApprovalLens Socket Path in user settings."),
        );
      const client = createConnection(path);
      let data = "";
      client.setTimeout(3000, () => client.destroy(Error("Service timeout")));
      client.on("connect", () =>
        client.write(JSON.stringify({ method, id }) + "\n"),
      );
      client.on("error", reject);
      client.on("data", (b) => {
        data += b;
        if (data.length > 1048576) client.destroy(Error("Response limit"));
      });
      client.on("end", () => {
        try {
          const r = JSON.parse(data);
          if (!r.ok) throw Error("Service rejected request");
          resolve(r.result);
        } catch (e) {
          reject(e);
        }
      });
    });
  }
  const chatLabel = (id) =>
    id === "legacy"
      ? "Earlier activity (chat unknown)"
      : `Chat ${id.slice(0, 8)}`;
  const groups = () =>
    Array.from(new Set(rows.map((r) => r.conversationId || "legacy"))).map(
      (id) => ({
        kind: "chat",
        id,
        children: rows.filter((r) => (r.conversationId || "legacy") === id),
      }),
    );
  async function inspect(row) {
    if (!row?.id) return;
    const details = row.canApprove ? await rpc("inspect", row.id) : row;
    if (!details) {
      vscode.window.showWarningMessage("This review expired.");
      return;
    }
    const uri = vscode.Uri.parse(
      `approvallens-review:/action/${encodeURIComponent(row.id)}.json`,
    );
    documents.set(uri.toString(), JSON.stringify(details, null, 2));
    if (documents.size > 100) documents.delete(documents.keys().next().value);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, {
      preview: true,
      preserveFocus: false,
    });
  }
  async function decide(row, automatic = false) {
    if (!row?.canApprove) return;
    const details = await rpc("inspect", row.id);
    if (!details?.canApprove) return;
    const proposed = JSON.stringify(details.proposedAction, null, 2);
    const review = details.modelReview;
    const evidence = details.assessment?.evidence;
    const evidenceSummary = [
      evidence
        ? `Evidence: ${evidence.operationCoverage} operation coverage; ${evidence.content.map((item) => `${item.effectId}: ${item.status} (${item.basis})`).join("; ")}. Runtime behavior is not verified.`
        : "Evidence summary unavailable from this service version.",
      ...evidenceLines(details),
    ].join("\n");
    const findings = review
      ? [
          `Model: ${details.model || "unknown"}`,
          ...(details.contextNotes || []),
          `Disclosure: ${review.disclosure.fidelity}; intent: ${review.intent.alignment}`,
          ...review.disclosure.findings.map(
            (f) => `Disclosure finding: ${f.explanation}`,
          ),
          ...review.intent.findings.map(
            (f) => `Intent finding: ${f.explanation}`,
          ),
          ...review.disclosure.unresolvedQuestions.map(
            (q) => `Uncertain: ${q}`,
          ),
          ...review.intent.unresolvedQuestions.map((q) => `Uncertain: ${q}`),
          "Model findings are advisory. Raw file contents are omitted; configured JSON field changes may be sent to Nebius.",
        ].join("\n")
      : "AI intent review: NOT MEASURED.";
    const tooLong =
      proposed.length + findings.length + evidenceSummary.length > 6000;
    const choice = await vscode.window.showWarningMessage(
      `ApprovalLens · ${chatLabel(row.conversationId || "legacy")} · ${row.tool}`,
      {
        modal: true,
        detail: `${row.reason}\n\nTarget: ${row.target}\nChat ID: ${row.conversationId || "unknown"}\n\nProposed operation:\n${tooLong ? proposed.slice(0, 6000) + "\n[Truncated — use Inspect details before approving]" : proposed}\n\n${row.waiting ? "Approve resumes this waiting tool call. Closing this dialog denies it." : "Approval allows one identical retry within 30 seconds."}\n${evidenceSummary}\n\n${findings.slice(0, 6000)}`,
      },
      ...(!tooLong ? ["Approve once"] : []),
      "Reject",
      "Inspect details",
    );
    if (choice === "Inspect details") {
      await inspect(row);
      return;
    }
    const answer = await rpc(
      choice === "Approve once" ? "approve" : "reject",
      row.id,
    );
    if (!answer.ok)
      vscode.window.showWarningMessage(
        "Review expired or file changed. No approval was granted.",
      );
    await refresh();
  }
  async function notify() {
    if (prompting) return;
    prompting = true;
    try {
      for (const row of rows) {
        if (seen.has(row.id)) continue;
        if (row.canApprove && row.waiting) {
          seen.add(row.id);
          await decide(row, true);
        } else if (row.status === "blocked" && Date.parse(row.at) >= started) {
          seen.add(row.id);
          void vscode.window
            .showWarningMessage(
              `ApprovalLens blocked ${row.tool} · ${chatLabel(row.conversationId || "legacy")}: ${row.reason}`,
              "Inspect details",
            )
            .then((choice) => {
              if (choice) void inspect(row).catch(report);
            });
        }
      }
    } catch (e) {
      report(e);
    } finally {
      prompting = false;
    }
  }
  function report(e) {
    vscode.window.showErrorMessage(`ApprovalLens: ${e.message}`);
  }
  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    try {
      const result = await rpc("list"),
        folders = vscode.workspace.workspaceFolders || [];
      if (folders.length !== 1 || folders[0].uri.fsPath !== result.workspace)
        throw Error("Service belongs to another workspace.");
      const next = JSON.stringify(result.events);
      if (next !== JSON.stringify(rows)) rows = result.events;
      state = `Project hooks · ${result.liveHalted ? "LIVE STOPPED: invalid model reply" : result.mode === "LIVE" ? "Rules + Nemotron" : "Rules only"} · Read / whole-file Write / Delete / denied Shell`;
      const count = rows.filter((r) => r.canApprove).length;
      badge.text = `$(shield) ApprovalLens${count ? ` · ${count} waiting` : ""}`;
    } catch (e) {
      rows = [];
      state = e.message;
      badge.text = "$(warning) ApprovalLens offline";
    } finally {
      refreshing = false;
      badge.tooltip = state;
      const next = JSON.stringify([state, rows]);
      if (next !== signature) {
        signature = next;
        changes.fire();
      }
    }
    void notify();
  }
  const provider = {
    onDidChangeTreeData: changes.event,
    getChildren: (node) => {
      if (node?.kind === "chat" || node?.kind === "prompts")
        return node.children;
      const top = [];
      if (prompts.length)
        top.push({
          kind: "prompts",
          id: "prompts",
          children: prompts.map((prompt, index) => ({
            kind: "prompt",
            id: `prompt-${index}`,
            ...prompt,
          })),
        });
      top.push({ kind: "status", id: "status", target: state }, ...groups());
      return top;
    },
    getTreeItem(row) {
      if (row.kind === "prompts") {
        const item = new vscode.TreeItem(
          "Copy a prompt into chat",
          vscode.TreeItemCollapsibleState.Expanded,
        );
        item.id = "prompts";
        item.tooltip =
          "Click a prompt to copy it. Paste it into chat. Click Approve once yourself when a write is waiting.";
        item.iconPath = new vscode.ThemeIcon("copy");
        return item;
      }
      if (row.kind === "prompt") {
        const item = new vscode.TreeItem(row.title);
        item.id = row.id;
        item.tooltip = row.text;
        item.iconPath = new vscode.ThemeIcon("clippy");
        item.command = {
          command: "approvallens.copyPrompt",
          title: "Copy demo prompt",
          arguments: [row.text],
        };
        return item;
      }
      if (row.kind === "chat") {
        const pending = row.children.filter((r) => r.canApprove).length;
        const item = new vscode.TreeItem(
          chatLabel(row.id),
          pending
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.Collapsed,
        );
        item.id = `chat:${row.id}`;
        item.description = `${pending ? `${pending} need review · ` : ""}${row.children.length} calls`;
        item.tooltip = `Conversation: ${row.id}`;
        item.iconPath = new vscode.ThemeIcon("comment-discussion");
        return item;
      }
      const item = new vscode.TreeItem(
        row.kind === "status" ? row.target : `${row.tool} · ${row.target}`,
      );
      item.id = `action:${row.id}`;
      item.description = labels[row.status] || "";
      item.tooltip = `${evidenceLines(row).join("\n")}\n${row.reason || state}\n${row.at ? new Date(row.at).toLocaleTimeString() : ""}\nOutcome: ${row.outcome || "—"}`;
      item.iconPath = new vscode.ThemeIcon(
        row.canApprove
          ? "warning"
          : ["blocked", "rejected"].includes(row.status)
            ? "error"
            : row.status === "expired"
              ? "history"
              : "pass",
      );
      item.contextValue = row.canApprove ? "pending" : "record";
      if (row.kind !== "status")
        item.command = {
          command: "approvallens.inspect",
          title: "Inspect action",
          arguments: [row],
        };
      return item;
    },
  };
  context.subscriptions.push(
    changes,
    badge,
    vscode.window.registerTreeDataProvider("approvallens.activity", provider),
    vscode.workspace.registerTextDocumentContentProvider(
      "approvallens-review",
      {
        provideTextDocumentContent: (uri) =>
          documents.get(uri.toString()) || "Review no longer available.",
      },
    ),
    vscode.commands.registerCommand("approvallens.copyPrompt", async (text) => {
      await vscode.env.clipboard.writeText(String(text || ""));
      vscode.window.showInformationMessage(
        "Copied the demo prompt. Paste it into chat. Click Approve once yourself when a write is waiting.",
      );
    }),
    vscode.commands.registerCommand("approvallens.refresh", refresh),
    vscode.commands.registerCommand("approvallens.inspect", (row) =>
      inspect(row).catch(report),
    ),
    vscode.commands.registerCommand("approvallens.approve", (row) =>
      decide(row).catch(report),
    ),
    vscode.commands.registerCommand("approvallens.reject", async (row) => {
      try {
        if (row?.canApprove) await rpc("reject", row.id);
        await refresh();
      } catch (e) {
        report(e);
      }
    }),
  );
  const timer = setInterval(refresh, 1000);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });
  void refresh();
  void vscode.commands.executeCommand("approvallens.activity.focus");
}
module.exports = { activate };
