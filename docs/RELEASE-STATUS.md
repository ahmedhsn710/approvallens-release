# Verified release status — 26 October 2026

## Public surfaces

- Source: https://github.com/ahmedhsn710/approvallens-release
- Product: https://approvallens-release.vercel.app
- Judge guide: https://approvallens-release.vercel.app/guide
- MCP: https://approvallens-release.vercel.app/api/mcp (Streamable HTTP POST)
- Extension: https://open-vsx.org/extension/ahmedhsn710/approvallens-cursor
- VSIX fallback: https://github.com/ahmedhsn710/approvallens-release/releases/latest
- Publisher verification request: https://github.com/EclipseFdn/open-vsx.org/issues/14732

The registry listing and download are public. The publisher is still marked unverified pending the external namespace review. OIDC publishing additionally requires namespace ownership, so it is not enabled yet. Publishing currently uses the approved `OVSX_PAT` secret in the GitHub `marketplace` environment.

## Validation performed

- 229 automated tests passing across 23 files, including shared core, native guard, stdio MCP and hosted transport.
- TypeScript check, formatting check, Next.js production build and isolated VSIX packaging pass.
- GitHub checks and versioned release workflow succeeded.
- Public homepage and guide return HTTP 200.
- Actual MCP SDK client initialized against the deployed endpoint, listed tools and reviewed all three samples: safe change → review in rules-only mode; protected-field change → block; ungranted file → block. Every result remains non-executable.
- Fresh sample setup starts the local companion and passes policy location, hook registration, baseline, service identity, mode and version diagnostics. Extension activation and real Cursor chat behavior are separate manual checks, not implied by these diagnostics.
- Hosted LIVE smoke at 05:24 PKT: one Nebius request, model `nvidia/nemotron-3-super-120b-a12b`, semantic review `MEASURED`, no error, `executable:false`. Usage: 1,920 prompt + 533 completion = 2,453 tokens. This is a functional smoke result, not an accuracy benchmark.

## Operational configuration

Vercel Hobby hosts the app. A dedicated Upstash Free Redis store persists model-call reservations with eviction disabled. Redis credentials and model secrets are scoped to Production. Anonymous public requests remain rules-only. The approved LIVE cap is three total admitted model calls, with one consumed by the smoke test. No paid hosting plan was selected. Do not clear the counter to restore quota.

Private judge configuration is retained only in ignored, owner-readable local files. Do not commit it or put the judge bearer token into the public submission text. Supply it through the competition's private judge instructions if supported.

## Remaining external / submission work

- Open VSX namespace verification is awaiting maintainers. The extension remains downloadable with an unverified-publisher notice.
- Switch to OIDC trusted publishing after namespace ownership is granted; this needs a reviewed registration bound to this repo/workflow/environment.
- Record the final three-minute video, recheck current hackathon requirements, and submit. These were not performed as part of hosting setup.
- Decide a judge-testing budget before increasing the three-call smoke limit. Two slots remain unless another authorized caller uses them.
- The production dependency audit is clean; the development publishing toolchain has a documented upstream Azure MSAL advisory in SECURITY.md.
