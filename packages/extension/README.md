# ApprovalLens for Cursor

**Proof before permission.** Review native agent-tool activity by chat, inspect policy evidence, and decide on eligible waiting file changes.

[Product page](https://approvallens-release.vercel.app) · [Setup guide](https://github.com/ahmedhsn710/approvallens-release/blob/main/docs/EXTENSION-SETUP.md) · [Source](https://github.com/ahmedhsn710/approvallens-release)

## Install and try

Install `ahmedhsn710.approvallens-cursor` from the extension registry, or use the VSIX on [GitHub Releases](https://github.com/ahmedhsn710/approvallens-release/releases/latest).

Open one trusted local folder and run **ApprovalLens: Enable for this workspace**. The extension bundles its local companion, adds project hooks and MCP configuration, and creates `.approvallens/rules.json`. No repository clone, npm install or separate Node installation is required. macOS/Linux only.

Edit the exact operation/path grants and intent, then run **ApprovalLens: Apply rules**. The starter grants only reading `package.json`. Unsupported hooked tools are denied.

Use **ApprovalLens: Connect hosted review** to enter a pilot access token and explicitly enable evidence transmission to Vercel/Nebius. Anonymous installations work in rules-only mode; hosted inference is subject to a limited shared quota, not an unlimited public service. See the [complete setup guide](https://github.com/ahmedhsn710/approvallens-release/blob/main/docs/EXTENSION-SETUP.md).

## What you see

- Activity grouped by available chat IDs, with stable status rows and pending counts.
- A review dialog for eligible mutations: operation, target, explanation, evidence, limitations and model findings when available.
- Explicit **Approve once** or **Reject** decisions. Cancellation, disconnect and timeout deny the request.
- Service identity, rules-only/LIVE status, disclosed JSON fields and live-stop diagnostics.

The service holds supported eligible operations for up to 100 seconds and rechecks the file before allowing the original call. Workspace enablement configures waiting mode and the 120-second hook timeout automatically.

## Review logic

Deterministic scope and protected-field checks run first. Configured LIVE mode sends eligible requests to NVIDIA Nemotron through Nebius, validates the reply, and presents evidence to the human. Model output cannot override policy or grant execution. Failures and exhausted budgets deny native actions. Rules-only mode explicitly reports `NOT_MEASURED` for semantic review.

The bundled companion and MCP share the review engine. The extension stores the pilot access token in editor SecretStorage; the Nebius key remains server-side.

## Coverage and privacy

Supported mappings are deliberately narrow. Unsupported hook-delivered operations are logged and blocked. Built-in search can have hook-coverage gaps; manual edits, Tab and all parallel chat activity are not comprehensively intercepted. This is not an operating-system sandbox, and same-user processes remain inside the trust boundary.

The extension itself sends no analytics or external telemetry. It displays activity from the local Unix-socket service. The companion retains local records in its configured state directory until removed by its operator. Optional LIVE review sends the configured intent, explanation and analyzed evidence to Nebius; raw write bodies are omitted, while explicitly disclosed JSON field changes may be included. No API key is stored in extension settings. See the [privacy and boundary guide](https://approvallens-release.vercel.app/privacy).

A model error stops native LIVE review across restarts. Budget reservations remain preserved. Bounded conversation history is observation context, not verified execution receipts or a complete transcript.

## Troubleshooting and removal

Run **ApprovalLens: Check setup**. Use **Disable for this workspace** before uninstalling; it removes only owned hook and MCP entries and stops the companion. Removing the extension first leaves fail-closed hooks which need manual removal. Rules edits become active only after **Apply rules**. The applied policy and local audit records live outside the repository under `~/.approvallens/`.

MIT licensed. Release preview; namespace verification status is shown by Open VSX.

## Shell inspection and sensitive data (0.6.0)

Explicitly enable `shellInspection` in rules and apply them. Supported absolute system executables include cat, head, tail, wc, fixed-string grep and pwd, with controlled options. Pipelines and conditional lists check every file and stage. Bare commands, scripts, redirections and network transfers remain denied. Supported reads and outbound review payloads are checked for common credentials and policy `blockedTerms`; this is detection, not guaranteed zero-egress protection.

See the [setup and verification cases](https://approvallens-release.vercel.app/guide). No terminal service is required for installed users.

# Suggested project rules

After connecting hosted review, run **ApprovalLens: Suggest project rules**. Describe the task and inspect the disclosure preview. Nemotron returns an exact-path read/write policy draft and reasons. No source contents are uploaded. Existing restrictions remain in the draft; review it, save to `.approvallens/rules.json` and explicitly run **Apply rules**. Nothing is applied automatically.
