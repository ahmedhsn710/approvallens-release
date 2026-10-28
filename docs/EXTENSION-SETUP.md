# Bundled workspace integration (0.7.0)

## User workflow

1. Install ApprovalLens in Cursor on macOS/Linux. No source checkout, npm install, Node installation or manually started service is required: the package bundles JavaScript and uses Cursor's Electron Node runtime.
2. Open **one trusted local folder**. Run **ApprovalLens: Enable for this workspace** from the command palette or the Activity view menu.
3. Confirm workspace enablement. This creates `.approvallens/rules.json`, merges `.cursor/hooks.json`, adds the public hosted MCP under `approvallens` in `.cursor/mcp.json`, and starts the bundled companion. Cursor may require enabling/trusting the added MCP server and a new chat before host configuration changes take effect.
4. Edit rules and run **ApprovalLens: Apply rules**. Read the confirmation before applying. The starter grants only reading `package.json`; mutations and unsupported calls are denied by default.
5. For AI review, run **ApprovalLens: Connect hosted review**, accept the evidence disclosure and enter an ApprovalLens pilot access token. It is stored in the editor's SecretStorage, never in repository settings. No token is bundled. Hosted AI currently uses the limited shared pilot quota; anonymous installations do not have free unlimited inference.
6. Run a supported Read/whole-file Write/Delete operation from a Cursor agent. Exact granted ordinary reads pass locally. Hard policy violations stop locally. Eligible mutations/critical reads are reviewed remotely when LIVE is configured, then held for explicit approval. Closing the review dialog rejects the operation. File state is checked again before an approval is returned.

The extension menu includes **Edit rules**, **Apply rules**, **Connect hosted review**, **Check setup**, and **Disable for this workspace**. Disable before uninstalling. Removing the extension without disabling leaves fail-closed hooks pointing to an unavailable runtime; remove the owned hook entries manually if necessary.

## Example editable policy

For a disposable project containing `demo.txt`, replace the starter policy with:

```json
{
  "version": 1,
  "taskId": "update-demo",
  "developerIntent": "Update demo.txt for the requested demonstration. Do not modify other files.",
  "grants": [
    { "operation": "read_file", "path": "demo.txt" },
    { "operation": "write_file", "path": "demo.txt" }
  ]
}
```

These are exact operation/path grants, not globs. File bodies are not checked for arbitrary program behavior. Use the existing policy `evidence` and `constraints` schema for explicitly disclosed JSON pointer comparisons; see the example profiles. Do not grant write access to security configuration.

## Trust and state

- The editable repository policy is a proposal. The active policy is an explicitly applied snapshot under `~/.approvallens/<workspace-hash>/config.json`, outside the inspected repository.
- Agent writes to `.approvallens/**`, `.cursor/**`, and `.vscode/settings.json` are denied by the supported file adapter, even if accidentally granted in policy.
- State includes bounded `activity.json`, metadata-only hook receipts, a Unix socket and setup backups. History may contain policy-disclosed evidence. Remove intentionally when no longer needed.
- The companion uses bundled code and bounded JSON persistence, avoiding native SQLite ABI dependencies in the editor runtime. The original development daemon remains available for existing workflows.
- Reloads invalidate pending decisions. Startup uses the last applied snapshot, never silently applies edits to the rules file, and refreshes hook paths after extension upgrades.
- The extension stops its managed companion when disposed. Hooks deny requests if the service is unavailable. Do not claim protection when Cursor does not deliver a hook event.

## MCP and model routing

The native companion is itself an MCP client. It calls authenticated `approvallens_review_evidence` at the hosted endpoint with client-observed analysis. This route returns model findings, never execution permission. The local shared pipeline validates findings and retains policy authority.

Agent-initiated MCP calls may be denied as unsupported by the restrictive native guard; use a separate client for the sample when needed. The separately installed public MCP entry exposes the synthetic walkthrough to the coding agent. It does not carry the private token and cannot invoke the private evidence-review tool. Configuring MCP is not what intercepts native operations; the project hooks do that. The private token is reserved for automatic native review, not agent-controlled arbitrary model calls.

The server labels evidence as client-observed, not server-verified. Raw write bodies are replaced before transmission; configured intent, explanation, file paths and explicitly disclosed JSON values leave the machine only after hosted review is enabled. The endpoint is pinned to the official deployment. Required remote failures halt LIVE locally and deny the operation. Reconnecting explicitly clears the local failure halt but never resets Redis reservations.

## Coverage and current limits

- No separate small-model classifier exists. Routing is deterministic and shared with the original controller.
- Supported mappings remain Read/whole-file Write/Delete. Shell inspection is opt-in and supports bounded read-only literal pipelines; scripts, network transfers, redirections and other unsupported hook-delivered calls remain denied. Built-in search may not emit compatible hooks. This is a restrictive pilot, not a general daily-driver agent firewall.
- Current chat prose is not reliably supplied by Cursor. The model uses the applied developer intent; missing explanations are marked unknown.
- Single local folder only; Windows, remote SSH/containers, and multi-root workspaces are not supported by this onboarding release.
- No automatic account signup or individual quotas yet. The owner can explicitly select authenticated uncapped testing mode. A broadly available AI service requires authentication and per-user quotas before opening access.
- OS sandboxing, universal interception, and stopping every parallel chat activity are not provided.

## Verification

Automated tests cover idempotent setup, preserving other hooks/MCP servers, conflict/symlink rejection, applied-policy isolation, bundled companion startup without npm/SQLite, waiting for a human decision, protected rules, remote redaction and response validation. A simulated hook test is not a live Cursor chat test. Record UI/live validation separately before claiming support for a specific Cursor version.

For the maintained installation steps and test matrix, use [the product setup guide](https://approvallens-release.vercel.app/guide). Detailed shell semantics and data boundaries are in [SHELL-AND-EGRESS.md](SHELL-AND-EGRESS.md).
