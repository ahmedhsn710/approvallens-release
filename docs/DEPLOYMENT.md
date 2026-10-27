# Deployment and publishing

## Vercel: one app for landing page and MCP

Import this GitHub repository into the existing Vercel team. Framework: Next.js. Root directory: `apps/site`. Include files outside the root directory so shared packages are available. Use the root lockfile/workspaces. If overriding commands, install with `cd ../.. && npm ci` and build with `cd ../.. && npm run build`; output stays Next.js default.

Vercel's Git integration deploys main automatically and creates preview deployments for pull requests. Keep production secrets scoped to Production; untrusted PR previews must not receive model keys. Do not weaken deployment protection for previews. The production URL must be publicly reachable for judges.

The public endpoint `/api/mcp` is stateless Streamable HTTP POST. A GET returns 405 by design. Verify with an MCP client, not a browser GET alone. `/` and `/guide` are public static pages.

## Optional bounded LIVE mode

Set Production environment variables:

- `NEBIUS_API_KEY`: existing dedicated project key, server-side only.
- `NEBIUS_MODEL`: `nvidia/nemotron-3-super-120b-a12b`.
- `APPROVALLENS_JUDGE_TOKEN`: strong private bearer token, supplied privately to judges.
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`: dedicated free Redis store REST credentials. The Vercel integration’s automatically injected `KV_REST_API_URL` / `KV_REST_API_TOKEN` are also supported; no manual copying is needed.
- `APPROVALLENS_MAX_LIVE_CALLS`: start with 3 for smoke testing; raising it requires budget review.

Never use a temporary filesystem or process variable as a durable spending ledger. The Redis key `approvallens:hosted:v1:reservations` monotonically counts admitted model requests. Keep it across deploys. An exhausted or unavailable store blocks LIVE. Hard deterministic denials consume no model reservation. The call cap is not a provider-enforced dollar cap; output is capped at 1,800 tokens and requests at 32 KiB. Keep the Nebius project's own spend controls enabled.

Redeploy after changing environment values. Test the safe sample with the private header and confirm actual LIVE output. Do not display the token in screenshots, logs, CI output or public docs. Public anonymous requests remain rules-only.

## Open VSX

Official guide: https://github.com/EclipseFdn/open-vsx.org/wiki/Publishing-Extensions

1. Sign in with GitHub as the intended publisher.
2. Link an Eclipse account and complete the Publisher Agreement.
3. Create the namespace matching `packages/extension/package.json`: `ahmedhsn710`. Check current namespace ownership/marketplace matching requirements before publishing.
4. Create a publishing access token and store it as `OVSX_PAT` in the GitHub `marketplace` environment. Token creation and account agreements need the account owner's authorization. Do not store the token in source control or a local documentation file.
5. Run the manual **Release extension** workflow on main. Set `publish_openvsx` only after the namespace and token are ready.
6. Verify the listing and install the published version in a disposable Cursor project.

The CI workflow checks formatting, types, tests, production build and extension package on pushes and PRs. Releases are manual and versioned to prevent accidental immutable registry publication. Bump package versions before a new release; do not overwrite a released version. If publishing fails after the GitHub release is created, use the already tested asset with the registry CLI rather than rerunning release creation blindly.

GitHub release VSIX downloads are the immediate distribution fallback. A downloadable VSIX is not the same as a public marketplace listing. No Microsoft Marketplace or paid hosting is assumed.

## Current deployment

See [RELEASE-STATUS.md](RELEASE-STATUS.md) for verified URLs, live test evidence and external namespace-review status. The publishing token is configured in the `marketplace` environment. Open VSX trusted publishing requires namespace ownership and an active extension; after ownership verification, register this repository and the publishing workflow with the `marketplace` environment, then use `ovsx publish --trusted-publishing` with `id-token: write`. Do not remove the existing token until the replacement path has been tested.

## Extension-first remote review (0.5.0)

The bundled companion calls authenticated `approvallens_review_evidence`. It uses the same pilot bearer secret and durable quota as the existing LIVE sample. Authenticated discovery exposes this private tool; public discovery does not. Evidence is client-observed, raw write bodies are omitted, and the result is always advisory. Installed users enter the pilot token through Connect hosted review; never distribute the Nebius key to clients.

Deploy the server before directing users to connect the new extension. A successful connection checks authenticated tool discovery without spending a model call. Server deployment and extension release are independent: changes to bundled local logic require publishing a new VSIX. Public distribution of the extension does not imply unlimited public model access.
