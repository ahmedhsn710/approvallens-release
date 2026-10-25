# ApprovalLens for Cursor — release preview 0.4.0

Project-wide native-hook activity, grouped by chat, with automatic review dialogs for eligible file mutations. Requires the separate ApprovalLens local service and project hooks. Installing this extension alone does not intercept tools.

Set **ApprovalLens: Socket Path** in user settings, or use the generated sample project's workspace setting. Use `approvalMode: "wait"` in the developer-owned service configuration and re-run the project's hook setup for the 120-second hook timeout. The service holds an eligible action for up to 100 seconds, then denies it unless approved. Approval resumes the original waiting call; rejection, cancellation, disconnect and timeout deny it. File state is checked again before approval.

The popup shows the chat ID, operation, target, proposal and reason. The sidebar groups conversations, shows pending counts and stable status rows, and offers inspect/review/reject actions. Old records lacking a chat ID remain in a separate legacy group. Titles are currently short chat IDs.

Native checks run first. Optional LIVE mode routes eligible mutations and configured critical reads to Nemotron, then shows validated findings for a human decision. Model failures and exhausted budgets deny the action. Raw file bodies are omitted; explicitly configured JSON field changes may be sent to Nebius. The modal shows evidence coverage and basis, not a guarantee of code correctness. Rules-only mode still reports NOT_MEASURED. Read/Write/Delete mappings remain deliberately narrow. Hook-delivered unsupported native operations are logged and blocked without an override. This does not pause all parallel activity in a chat, cover manual edits or Tab, or create an OS sandbox. Same-user processes remain within the trust boundary. Project hooks must stay enabled.

The compatibility `retry` mode still supports a 30-second identical-retry permit. No API keys belong in extension settings. macOS/Linux only; no marketplace release yet. See docs/NATIVE-GUARD.md in this repository for architecture, setup, tests, limits and uninstall steps.

Built-in web search has model-dependent hook coverage gaps; the extension does not claim universal interception. Metadata-only hook receipts help distinguish absent events from rejected payloads.

Live sessions stop after an invalid reviewer reply and retain that stop across service restarts. The shield reports LIVE STOPPED. There is no automatic retry or UI reset. Budget reservations are preserved.

Version 0.3.3 keeps service status visible above Activity groups and shows policy-disclosed JSON pointers, preserve checks and available model telemetry in the approval dialog and action tooltip. No policy or approval rules live in the presentation helper.

Version 0.3.4 labels bounded local history in the approval evidence display. It contains same-conversation observations since service startup, not verified execution receipts or a complete chat transcript.

Version 0.3.5 lets the generated demo workspace select its local service socket without changing global Cursor settings. The socket setting remains machine-specific and is not synchronized.

Version 0.3.6 shows the sample prompts in Activity when the generated project includes them. Clicking a prompt copies it. The extension still does not approve a write.
