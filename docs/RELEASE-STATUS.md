# Release status — 28 October 2026

## Published 0.6.0

- [Product](https://approvallens-release.vercel.app), [setup and verification](https://approvallens-release.vercel.app/guide), [judge walkthrough](https://approvallens-release.vercel.app/judges).
- [Open VSX](https://open-vsx.org/extension/ahmedhsn710/approvallens-cursor): public version API confirms 0.6.0 and verified publisher status.
- [GitHub release](https://github.com/ahmedhsn710/approvallens-release/releases/tag/v0.6.0): versioned VSIX and SHA256SUMS.
- [Release workflow](https://github.com/ahmedhsn710/approvallens-release/actions/runs/40563763093): all checks and registry upload succeeded.
- Vercel deployed release source `8cbbbff`; product homepage, setup and separate judge page are live.

## Verification

279 functional tests across 27 files passed. Formatting, typechecking, site build and extension packaging passed locally and in release CI. Desktop/mobile layouts were inspected; the mobile guide has no horizontal overflow. Public MCP samples return review/block/block with no execution authority. The release VSIX checksum is verified against SHA256SUMS.

Shell regressions include a harmless real fixture pipeline authorized by the controller, plus blocked network stages, sensitive reads, ungranted conditional branches, symlinks and unsafe flags. These are functional checks, not a benchmark accuracy result or a new live Cursor chat test.

Earlier 0.5.0 verification demonstrated an actual Cursor native Write held for approval and resumed after approval. Production Nemotron evidence review was verified on 27 October: 1,975 tokens, approximately 4.6 seconds, validated findings and no server execution authority. No new paid model call was made for 0.6.0.

The old local extension was uninstalled at the owner's request. Its owned hooks/MCP entry were removed from the disposable onboarding workspace; rules and audit history were preserved. Restart Cursor before a fresh marketplace installation and use a new disposable folder for verification.

## Operations and remaining limits

Vercel Hobby serves the app/MCP; Upstash Free Redis preserves aggregate model-call reservations. Keys remain in Production secrets or editor SecretStorage. Two of three approved test reservations were used by earlier tests; one remains unless another authorized caller consumes it. Do not reset the counter or silently raise the cap.

Native coverage and sensitive-data detection are bounded, not universal interception or zero-egress guarantees. Individual hosted quotas/authentication, Windows/remote/multi-root support, independent benchmark labeling, optional OIDC publishing and the final competition submission remain outside this release. See SECURITY.md for the previously documented publishing-toolchain advisory.
