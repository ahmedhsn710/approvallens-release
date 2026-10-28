# Release status — 29 October 2026

## 0.7.0

Source commit: 023a81d. CI and release workflow succeeded. The versioned GitHub VSIX is available; Open VSX publication was submitted by the release workflow. Registry propagation can lag.

- Product: https://approvallens-release.vercel.app
- Architecture: https://approvallens-release.vercel.app/architecture
- Setup: https://approvallens-release.vercel.app/guide
- Judge verification: https://approvallens-release.vercel.app/judges
- GitHub release: https://github.com/ahmedhsn710/approvallens-release/releases/tag/v0.7.0
- Release workflow: https://github.com/ahmedhsn710/approvallens-release/actions/runs/40753894641

## Verified

285 functional tests across 29 files passed in clean Linux CI, along with formatting, typechecking, site build and extension packaging. Local integration tests encountered restricted temporary paths; CI ran the full suite successfully. Functional checks are not an accuracy benchmark.

A production MCP rule-suggestion call returned a validated, unapplied draft using NVIDIA Nemotron Super on Nebius: 432 tokens, approximately 3.5 seconds. A separate production evidence review returned validated faithful/aligned findings: 1,803 tokens, approximately 3.1 seconds. Neither server response grants execution.

The owner enabled APPROVALLENS_LIVE_BUDGET_MODE=uncapped in Vercel Production. This bypasses the aggregate Redis call ceiling for authenticated model requests. Authentication, request limits, output-token bounds and timeouts remain enforced; anonymous requests cannot access model tools. Provider costs and limits still apply. The existing capped-mode counter was not reset.

## Remaining verification

Record the final native Cursor demonstration with the published extension; this release does not claim a new manually exercised native chat session. Earlier 0.5.0 verification demonstrated a native Write held for approval and resumed after approval. Suggested-rule validation and inventory exclusions are tested; the editor draft workflow still needs final user rehearsal. See DEMO.md for the recording plan.

Native coverage is bounded, sensitive-data detection is not a zero-egress guarantee, and arbitrary source-code semantics are not proven. Windows, remote and multi-root workspaces, per-user hosted quotas and independent benchmark labeling remain outside this release.
