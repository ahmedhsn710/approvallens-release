const { randomBytes } = require("node:crypto");
const escape = (value) =>
  String(value ?? "—").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const label = (key) =>
  key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
function structured(value) {
  if (Array.isArray(value))
    return value.length
      ? `<ul>${value.map((item) => `<li>${structured(item)}</li>`).join("")}</ul>`
      : "<p>None</p>";
  if (value && typeof value === "object")
    return `<dl>${Object.entries(value)
      .map(
        ([key, item]) =>
          `<dt>${escape(label(key))}</dt><dd>${structured(item)}</dd>`,
      )
      .join("")}</dl>`;
  return `<span class="value">${escape(value)}</span>`;
}
function dialogHtml(title, sections, actions, nonce) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'"><style nonce="${nonce}">
  *{box-sizing:border-box}html,body{height:100%;margin:0}body{display:flex;flex-direction:column;background:var(--vscode-editor-background);color:var(--vscode-foreground);font:var(--vscode-font-size)/1.6 var(--vscode-font-family)}main{flex:1;min-height:0;overflow:auto;padding:20px;overflow-wrap:anywhere}h1{font-size:22px;margin:0 0 20px}h2{font-size:15px;margin:0 0 12px}section{border:1px solid var(--vscode-panel-border);border-radius:8px;padding:16px;margin:0 0 16px}dl{margin:0}dt{font-weight:600;text-transform:capitalize;margin-top:10px}dd{margin:3px 0 12px}dd dl{padding-left:12px;border-left:2px solid var(--vscode-panel-border)}ul{padding-left:20px;margin:0}li{margin-bottom:10px}.value{white-space:pre-wrap}footer{flex:none;display:flex;flex-wrap:wrap;gap:8px;padding:12px 20px;border-top:1px solid var(--vscode-panel-border);max-height:40vh;overflow:auto}button{font:inherit;padding:7px 16px;border:1px solid transparent;border-radius:4px;cursor:pointer;color:var(--vscode-button-foreground);background:var(--vscode-button-background)}button.secondary{color:var(--vscode-button-secondaryForeground);background:var(--vscode-button-secondaryBackground)}button:focus-visible,main:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:2px}
  </style></head><body><main tabindex="0"><h1>${escape(title)}</h1>${sections.map(([heading, value]) => `<section><h2>${escape(heading)}</h2>${structured(value)}</section>`).join("")}</main><footer>${actions.map((action, i) => `<button class="${i ? "secondary" : ""}" data-action="${escape(action)}">${escape(action)}</button>`).join("")}</footer><script nonce="${nonce}">const vscode=acquireVsCodeApi();document.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('button').forEach(b=>b.disabled=true);vscode.postMessage({action:button.dataset.action});}));</script></body></html>`;
}
function showDialog(vscode, title, sections, actions = ["Close"]) {
  const panel = vscode.window.createWebviewPanel(
    "approvallens.dialog",
    title,
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [],
    },
  );
  panel.webview.html = dialogHtml(
    title,
    sections,
    actions,
    randomBytes(16).toString("base64url"),
  );
  return new Promise((resolve) => {
    let settled = false;
    const messages = panel.webview.onDidReceiveMessage((message) => {
      if (message && actions.includes(message.action)) finish(message.action);
    });
    const disposal = panel.onDidDispose(() => finish(undefined));
    function finish(action) {
      if (settled) return;
      settled = true;
      messages.dispose();
      disposal.dispose();
      panel.dispose();
      resolve(action);
    }
  });
}
function confirm(vscode, title, options, ...actions) {
  let detail = options.detail;
  try {
    detail = JSON.parse(detail);
  } catch {
    /* Plain-language disclosure. */
  }
  return showDialog(
    vscode,
    title,
    [["What you are authorizing", detail]],
    [...actions, "Cancel"],
  );
}
module.exports = { dialogHtml, showDialog, confirm };
