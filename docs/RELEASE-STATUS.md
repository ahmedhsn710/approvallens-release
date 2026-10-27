# Verified release status — 27 October 2026

## Public surfaces

- Source: https://github.com/ahmedhsn710/approvallens-release
- Product and setup: https://approvallens-release.vercel.app and `/guide`
- MCP: https://approvallens-release.vercel.app/api/mcp (Streamable HTTP POST)
- Extension listing: https://open-vsx.org/extension/ahmedhsn710/approvallens-cursor
- Versioned package: https://github.com/ahmedhsn710/approvallens-release/releases/tag/v0.5.0
- Release workflow: https://github.com/ahmedhsn710/approvallens-release/actions/runs/40490580497

Open VSX now reports a **verified publisher**. The namespace request was closed as completed by a maintainer. Token-based publishing remains configured; OIDC migration has not been performed.

The 0.5.0 release workflow passed every check and reported a successful Open VSX upload. Public registry propagation is being checked separately; use the versioned GitHub VSIX if the library still shows 0.4.1.

## Validation evidence

- 238 automated tests across 25 files passed locally and in release CI.
- Formatting, TypeScript, Next.js production build and VSIX packaging passed.
- Four bundled onboarding integration tests passed under Cursor's Electron Node runtime.
- Actual Cursor chat: a native Write paused at ApprovalLens's dialog; approving once resumed the chat and produced the expected file content in a disposable project. This was RULES_ONLY, not a live-model UI test.
- Final local 0.5.0 VSIX installed successfully in Cursor. Already-open editor windows may need reloading to activate updated code.
- Vercel deployed implementation commit `73fc462`; the extension-first homepage and guide were inspected in the browser.
- Production anonymous MCP scenarios: safe change → review, protected-field change → block, outside-scope → block. All were RULES_ONLY and non-executable.
- Production private native evidence route: 27 October 10:42 UTC, genuine `nvidia/nemotron-3-super-120b-a12b` response through Nebius, 1,508 input + 467 output = 1,975 tokens, about 4.6 seconds. The remote client validated the findings. No execution authorization was granted.
- Earlier hosted sample LIVE test: 2,453 tokens. Functional smoke tests are not benchmark accuracy results.

## Operational configuration

Vercel Hobby hosts the website and MCP. A dedicated Upstash Free Redis store preserves aggregate inference reservations. Production secrets hold the Nebius key, pinned model, pilot bearer credential, Redis credentials and three-call cap. No secret is bundled in the extension or committed to source.

Two of the three approved model-call reservations have been used by these tests. One remains unless another authorized caller uses it. Do not clear the counter or raise the limit silently. Public extension installation does not provide unlimited model calls; broad access needs individual authentication and quotas.

## Outstanding work beyond this beta

- Confirm public Open VSX propagation independently from the successful upload.
- Optional OIDC migration now that namespace ownership is verified.
- Independent benchmark labeling and a larger judge-testing budget.
- Windows, remote/multi-root workspaces and broader verified native adapters.
- Final competition video and submission.

The production dependency audit was clean at the previous release; the development publishing toolchain advisory is documented in SECURITY.md. No new benchmark accuracy or universal interception claim is made.
