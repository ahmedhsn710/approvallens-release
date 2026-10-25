# Release plan — 26–30 October 2026

## Goal

Ship one professional source repository with shared logic, a hosted judge MCP, a native Cursor guard/extension and an honest product guide. Preserve original development history and benchmark research separately. Avoid reintroducing the old web dashboard, execution worker or general agent orchestrator.

## Phase 1 — clean extraction and validation

- [x] Extract core, MCP service, companion, extension and selected regression tests from source commit e25b04a.
- [x] Add stateless HTTP MCP and immutable judge fixtures.
- [x] Add landing page, judge guide and privacy boundaries.
- [x] Validate typecheck, production build and core tests.
- [ ] Finish hosted transport regressions, extension packaging and fresh-checkout smoke tests.
- [ ] Create the public release repository after secret/content audit.

Exit: runnable clean checkout, reproducible package, truthful docs, no inherited credentials/state.

## Phase 2 — hosting and CI/CD

- [ ] Connect GitHub repository to Vercel; root directory `apps/site`.
- [ ] Verify public homepage, guide and MCP initialization/tool calls on production URL.
- [ ] Provision a free durable Redis store for optional live spending admission.
- [ ] Configure server-side Nebius credentials, exact model and private judge token.
- [ ] Test one eligible LIVE request within the approved spending cap; record mode and outcome without sensitive payloads.
- [ ] Enable automated checks and manual versioned extension release artifacts.

Exit: judges can use remote MCP without starting a local server. Never label rules-only responses as live.

## Phase 3 — extension publication

- [ ] Complete Eclipse account and Open VSX publisher agreement (account-owner step).
- [ ] Create/verify namespace matching publisher `ahmedhsn710`.
- [ ] Configure publishing token as GitHub environment secret; never commit it.
- [ ] Publish tested VSIX; verify listing and install from registry in disposable Cursor project.
- [ ] Check clean install, safe approval, protected-field denial and cleanup.

Fallback: a tested public GitHub VSIX release is usable while registry onboarding is pending. It is not a marketplace listing.

## Phase 4 — submission freeze

- [ ] Replay judge walkthrough on final deployed commit.
- [ ] Record public video at most three minutes and complete current hackathon submission requirements after checking official rules.
- [ ] Document measured benchmark results with dataset/split/version provenance, separately from synthetic smoke tests.
- [ ] Verify public repository/license, working demo URL and live Nebius integration.
- [ ] Freeze scope; only fix defects affecting installation, approval correctness or judge access.

## Ownership and update discipline

Developer A: core evidence/policy, native guard, model-output validation, regression cases.
Developer B: hosted transport, UI/docs, deployment, release automation.
Both: contract changes, spending gates and final native approval verification.

Change core once, test through both transports, then release adapters together. Keep protocol/result versions explicit. Never introduce broad shell support, arbitrary remote repository execution, automatic approvals or unbounded live inference to improve the demo.

## Release evidence

Record final commit, CI result, deployed URL, test counts, VSIX checksum and explicit live/rules-only status in `docs/RELEASE-STATUS.md`. Mark account/provider blockers accurately; unchecked tasks above are not claims of completion.
