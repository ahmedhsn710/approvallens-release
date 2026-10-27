# Cursor native guard

## Bundled extension setup

For new installations, follow [Extension setup](EXTENSION-SETUP.md). The steps below remain for source-development and existing manually managed services.

## Prerequisites and sample

Use macOS or Linux, Node 24 and Cursor. From this checkout run `npm ci`, then `npm run demo:ready -- /tmp/al-settings-demo`. Choose a fresh short destination. This packages and installs the extension, creates a disposable sample and separate trusted state, starts the daemon, and opens the sample in Cursor. It prints paths for configuration, logs, process ID and diagnostics. No model is called and no write is approved by setup.

Open the ApprovalLens shield. Copy one sample prompt at a time. An eligible whole-file write opens a detailed review dialog. Choose Approve once yourself within the wait window; denial, cancellation or timeout stops that request. The sidebar groups activity by available chat IDs. Built-in search may not emit the hook events needed for interception; do not claim all tools are captured.

## Existing project

First create a developer-owned configuration outside the project. Review every operation/path grant and explicitly disclosed JSON field. Use `node scripts/cursor-setup.mjs <workspace> <state-directory>` to install project hooks while preserving unrelated settings. Inspect the generated configuration before starting `npm run cursor:service -- <config-file> <state-directory>`. Configure the extension socket to the same service socket. Use `npm run cursor:doctor -- <config-file> <state-directory>` for diagnostics.

Do not enable LIVE merely to troubleshoot setup. LIVE configuration requires the exact supported model, a secret supplied only to the service process, and the existing durable local spending ledger. Invalid model responses stop LIVE across restarts; do not delete the ledger to clear the stop. Inspect the cause first.

## Removal

Stop the service process using the process ID printed by sample setup. Remove only ApprovalLens-owned hook entries from `.cursor/hooks.json`, preserving other tools' hooks. Remove the sample's ApprovalLens socket setting if present. Uninstall `ahmedhsn710.approvallens-cursor` through Cursor Extensions. The original development preview used a different publisher identity; remove that older preview explicitly if both appear. Keep local budget state for audit until live use is finished. Delete only your disposable sample if no longer needed.

Installing a VSIX alone does not configure hooks, start the daemon or create an OS security boundary.
