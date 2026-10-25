# Architecture and trust boundaries

## Dependency direction

`extension → local companion → MCP review service → core`

`hosted MCP route → MCP review service → core`

`core → Nebius (only after eligible review and spending admission)`

The extension renders records and submits a human decision over a local Unix socket. It does not classify safety, manage API keys or override policy. The shared review service binds the developer intent, policy, action and evidence into stable hashes. Results carry evidence limitations and explicitly deny execution authority over MCP.

## Native path

`cursor-hook.mjs` forwards hook payloads to the local daemon. The controller normalizes supported tools, obtains configured local evidence and runs deterministic checks. The developer-owned configuration and SQLite state live outside the inspected workspace. Supported eligible file mutations can wait up to 100 seconds for the extension's review action; the hook timeout is configured to 120 seconds. Rejection, timeout, disconnect, stale file state or invalid model output prevents permission. Historical observations are bounded and are not execution receipts.

The daemon uses local state and Unix sockets, so it must not be deployed to a serverless function. The extension is a local UI, not an HTTP MCP client or cloud enforcement agent.

## Hosted path

`apps/site/app/api/mcp/route.ts` creates a stateless Streamable HTTP server per request. There is no in-memory session required between invocations. GET/SSE is not offered. The server exposes discovery samples and advisory review only. A server-owned settings fixture establishes the baseline; caller-provided grants and policy are rejected.

The public mode is rules-only. A server-side judge bearer credential can request LIVE review. Deterministic denial and incomplete evidence skip the model. Atomic Upstash Redis admission reserves a call before inference, across function instances. Reservations are never refunded after ambiguous failures. The limit is monotonic, capped at 100 by configuration, and defaults to zero. Recreating or clearing the store resets accounting and must not be used as routine recovery.

The only supported hosted model is `nvidia/nemotron-3-super-120b-a12b`. The Nebius adapter limits output tokens and validates structured responses. Raw write bodies are omitted; configured synthetic field changes and explanations can be transmitted. Hosted errors reveal no key or provider payload.

## Updating behavior safely

Change classification and evidence in `packages/core`, transport-independent policy handling in `packages/mcp`, native waiting/state logic in `packages/companion`, and presentation in `packages/extension`. Add a regression covering the observed failure and keep `executionAuthorized:false` on MCP results. Run typecheck, tests, build and VSIX packaging before release. Do not silently turn unsupported actions into permitted ones.
