# Judge walkthrough

## Primary demonstration: native Cursor approval

Install [ApprovalLens](https://open-vsx.org/extension/ahmedhsn710/approvallens-cursor) on macOS/Linux. Open a disposable single local folder containing `demo.txt`. Run **ApprovalLens: Enable for this workspace**. Follow [extension setup](EXTENSION-SETUP.md) to grant only reading and writing `demo.txt`, then **Apply rules**.

- **0:00–0:40:** Show the rules and applied scope. Explain that repository edits do not silently change the active policy.
- **0:40–1:30:** Ask the Cursor agent to use native whole-file Write to replace `demo.txt`. Show the waiting request, chat grouping, observed evidence and review mode. Reject it and verify the file is unchanged.
- **1:30–2:20:** Repeat the permitted write, inspect findings and approve once. Verify Cursor continues and the file changes. A supported attempt to write an ungranted path should be denied locally.
- **2:20–3:00:** Explain remote review and boundaries. With a privately supplied pilot token and remaining quota, connect hosted review before the run to display genuine Nemotron findings. Otherwise show RULES_ONLY honestly; do not claim a model ran.

The pilot uses a shared bounded quota. Contact the project team for a credential; no secret is published in this repository. The installed companion is bundled—judges do not need to clone source or start a terminal service.

## Secondary demonstration: hosted sample

For a no-install look at the review engine, connect an MCP client to `https://approvallens-release.vercel.app/api/mcp`. Call `approvallens_examples`, then review the safe-change, protected-change and outside-scope proposals using `approvallens_review`. The server owns synthetic baselines. It never touches local files or authorizes execution. Use a separate client/project if the restrictive native guard denies an agent-initiated MCP call.

Anonymous requests are RULES_ONLY. Authenticated eligible calls can invoke Nemotron when quota remains. A hard denial does not need a model call. Browser GET returning 405 is expected; this MCP transport uses POST.

## What to assess

Look for policy failures that cannot be overridden by persuasive text, explicit uncertainty, evidence freshness, the human decision boundary and honest mode reporting. Functional tests are reproducibility evidence, not a benchmark accuracy result. Built-in search and unsupported host paths are not universally intercepted. See [release status](RELEASE-STATUS.md) for verified deployment evidence.
