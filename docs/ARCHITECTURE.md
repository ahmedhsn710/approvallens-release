# Architecture and trust boundaries

## Extension-first runtime

The extension owns onboarding and user interaction. `workspace.cjs` merges project hooks and MCP configuration without overwriting unrelated entries. It creates an editable policy proposal and stores the explicitly applied snapshot outside the workspace. `onboarding.cjs` starts bundled JavaScript using Cursor's Electron runtime and keeps credentials in SecretStorage.

The hook sends events through a private local Unix socket. `extension-daemon.ts` persists bounded activity in JSON, avoiding native database ABI dependencies. The shared `controller.ts` maps supported tools, checks exact grants, observes file state, routes eligible reviews, and waits for approval. Pending decisions do not survive a restart. The companion stops when the extension closes its process pipe.

## Review sequence

1. Normalize the hook event and bind it to the workspace and chat.
2. Reject unsupported operations, ungranted paths, protected configuration changes, and hard constraint failures.
3. Collect supported local evidence. Missing evidence is not a safe result.
4. Pass ordinary permitted reads locally. Hold eligible sensitive operations. In LIVE mode call the remote reviewer; in RULES_ONLY show that no model ran.
5. Validate structured model findings against the local analysis. A server response never supplies execution authority.
6. Present the findings in Cursor. Approval is specific to the pending request; dismissal, expiry, failure or rejection denies it.
7. Recheck relevant file state before returning permission. Record later host outcome separately from approval.

## Hosted boundary

`packages/mcp/src/remote-review.ts` is an MCP client used by the companion. It pins the production endpoint, removes raw write bodies, bounds the request, and calls authenticated `approvallens_review_evidence`. This is distinct from the public MCP entry added for sample discovery.

`apps/site/app/api/mcp/route.ts` authenticates private discovery/calls, checks request shape, reserves durable quota and calls NVIDIA Nemotron through Nebius. Evidence is explicitly client-observed: Vercel cannot independently inspect local files. The result has `executable: false`. The local pipeline validates the returned findings again.

The public sample instead owns synthetic baselines on the server. It demonstrates the engine without installation but does not intercept tools or mutate files. Agent-initiated MCP calls can themselves be unsupported by the restrictive native guard; public sample access is not a bypass around native policy.

## Configuration and storage

- Workspace: `.approvallens/rules.json`, `.cursor/hooks.json`, `.cursor/mcp.json`.
- User state: `~/.approvallens/<workspace-hash>/` with applied configuration, activity, socket and setup ownership/backups.
- Editor SecretStorage: pilot bearer credential, never committed in MCP headers.
- Production secrets: Nebius key, pinned model, judge credential, Redis REST credentials and call limit.
- Redis: monotonic reservation counter retained across deployments; reconnection never resets it.

## Maintaining one source of logic

Change policy/analysis semantics in shared packages, then exercise them through both transports. Do not duplicate policy decisions in sidebar rendering or the website. The extension consumes controller findings; the server uses shared reviewers. `scripts/build-extension.mjs` bundles this source into the distributable package. Rebuild and release the extension when bundled shared code changes; a Vercel deployment alone cannot update installed local enforcement.

## Limits

Supported native mappings are Read/whole-file Write/Delete. Search coverage depends on host events; unsupported delivered calls fail closed. No OS sandbox, universal interception, per-user hosted quotas, automatic signup or Windows support is claimed. Active policy is explicit developer intent, not an assumed complete transcript of the chat.
