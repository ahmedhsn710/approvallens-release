# ApprovalLens for Cursor

**Proof before permission.** Review native agent-tool activity by chat, inspect policy evidence, and decide on eligible waiting file changes.

[Product page](https://approvallens-release.vercel.app) · [Setup guide](https://github.com/ahmedhsn710/approvallens-release/blob/main/docs/NATIVE-GUARD.md) · [Source](https://github.com/ahmedhsn710/approvallens-release)

## Install and try

Install `ahmedhsn710.approvallens-cursor` from the extension registry, or use the VSIX on [GitHub Releases](https://github.com/ahmedhsn710/approvallens-release/releases/latest).

**The extension needs the separate local companion and project hooks. Installing it alone does not intercept tools.** For a disposable demonstration, clone the repository, install Node 24, then run:

```sh
npm ci
npm run demo:ready -- /tmp/al-settings-demo
```

Choose a fresh destination. The launcher creates a sample, starts the local checker and opens Cursor. It does not call a model or approve a write. macOS/Linux only. Open the shield icon and copy one sample prompt at a time.

## What you see

- Activity grouped by available chat IDs, with stable status rows and pending counts.
- A review dialog for eligible mutations: operation, target, explanation, evidence, limitations and model findings when available.
- Explicit **Approve once** or **Reject** decisions. Cancellation, disconnect and timeout deny the request.
- Service identity, rules-only/LIVE status, disclosed JSON fields and live-stop diagnostics.

The service holds supported eligible operations for up to 100 seconds and rechecks the file before allowing the original call. Configure `approvalMode: "wait"` and the generated 120-second hook timeout. The extension's socket setting must point to the matching local service. The generated sample configures this per workspace.

## Review logic

Deterministic scope and protected-field checks run first. Configured LIVE mode sends eligible requests to NVIDIA Nemotron through Nebius, validates the reply, and presents evidence to the human. Model output cannot override policy or grant execution. Failures and exhausted budgets deny native actions. Rules-only mode explicitly reports `NOT_MEASURED` for semantic review.

No policy logic or API keys belong in the extension. Both MCP and the companion use the same review engine.

## Coverage and privacy

Supported mappings are deliberately narrow. Unsupported hook-delivered operations are logged and blocked. Built-in search can have hook-coverage gaps; manual edits, Tab and all parallel chat activity are not comprehensively intercepted. This is not an operating-system sandbox, and same-user processes remain inside the trust boundary.

The extension itself sends no analytics or external telemetry. It displays activity from the local Unix-socket service. The companion retains local records in its configured state directory until removed by its operator. Optional LIVE review sends the configured intent, explanation and analyzed evidence to Nebius; raw write bodies are omitted, while explicitly disclosed JSON field changes may be included. No API key is stored in extension settings. See the [privacy and boundary guide](https://approvallens-release.vercel.app/privacy).

A model error stops native LIVE review across restarts. Budget reservations remain preserved. Bounded conversation history is observation context, not verified execution receipts or a complete transcript.

## Troubleshooting and removal

Run `npm run cursor:doctor -- <config-file> <state-directory>` from the source checkout. Verify workspace trust, the service socket and the shield Activity view. For removal, stop the companion and remove only ApprovalLens-owned hook entries before uninstalling the extension; preserve other tools' settings. See the [full guide](https://github.com/ahmedhsn710/approvallens-release/blob/main/docs/NATIVE-GUARD.md).

MIT licensed. Release preview; namespace verification status is shown by Open VSX.
