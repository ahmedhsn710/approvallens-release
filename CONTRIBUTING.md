# Developer guide

## Get a reproducible checkout

Use Node 24+, run `npm ci`, then `npm run typecheck`, `npm test`, `npm run build` and `npm run extension:package`. No provider key is required for ordinary tests. `npm test` first rebuilds the bundled extension runtime. Build artifacts and local credentials are ignored.

## Where to work

- Review semantics: `packages/core` and `packages/mcp`. Add adversarial and legitimate cases together; never let model text override a hard denial.
- Native enforcement: `packages/companion/src/controller.ts`. Keep request binding, evidence freshness and human authorization here.
- Installed runtime: `packages/companion/src/extension-daemon.ts`. Keep filesystem permissions, bounded persistence and restart behavior explicit.
- Setup: `packages/extension/workspace.cjs` and `onboarding.cjs`. Preserve unrelated project configuration; do not silently apply changed rules.
- UI: `packages/extension/extension.cjs`. Show mode, uncertainty and findings accurately. UI must not invent an approval result.
- Hosted transport: `apps/site/app/api/mcp/route.ts` and `packages/mcp/src/remote-review.ts`. Preserve authentication, request bounds, redaction, model validation and durable quota.
- Product documentation: `README.md`, `docs/EXTENSION-SETUP.md`, site `/guide`. Installed users should not need the legacy development-service instructions.

Two developers can split shared enforcement/transport and extension/product work. Agree on request and finding schemas before changing both; keep commits small and run the full check suite before merging.

## Verification workflow

1. Add a meaningful regression for changed enforcement behavior, including a safe case and failure case.
2. Run typecheck and tests. For runtime changes also test the bundled artifact, not only TypeScript source.
3. Build the website and package VSIX. Inspect the package contents for accidental secrets or unnecessary dependencies.
4. Install in a disposable single-folder Cursor project. Enable, apply narrow grants, trigger a native whole-file write, reject once and approve once. Verify actual file content and activity outcomes.
5. Test disable/re-enable and preserve unrelated hooks/MCP configuration. Do not test destructive operations against real projects.
6. Provider calls require a deliberate budget allocation. Never reset production reservations to make a test pass. Record LIVE and mocked evidence separately.

## Release workflow

Bump workspace/extension versions together and update release notes. Push reviewed changes; CI checks formatting, types, tests, site build and packaging. Vercel deploys main. The manual `Release extension` workflow publishes the versioned VSIX and optionally Open VSX using the `marketplace` environment. Verify the registry version and production endpoint independently. Never overwrite an immutable release.

Secrets belong in ignored local files, editor SecretStorage, Vercel Production or GitHub environment secrets. Do not include credentials, user file contents or private chats in issues and screenshots. See [deployment](docs/DEPLOYMENT.md) and [security](SECURITY.md).
