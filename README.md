# ApprovalLens — proof before permission

An independent review layer for agent tool requests. ApprovalLens compares the **actual proposed action** with developer-owned policy and available evidence before a human approves it.

**Release preview · MIT · Node 24 · MCP + Cursor**

## Try it

[Live product page](https://approvallens-release.vercel.app) · [Judge guide](https://approvallens-release.vercel.app/guide) · [Download extension](https://github.com/ahmedhsn710/approvallens-release/releases/latest)

MCP endpoint: `https://approvallens-release.vercel.app/api/mcp`

The hosted application provides a product page, judge guide and Streamable HTTP MCP endpoint at `/api/mcp`. It deliberately has no web execution dashboard. See [deployment instructions](docs/DEPLOYMENT.md) and [the judge walkthrough](docs/JUDGE-GUIDE.md).

The public MCP uses an immutable synthetic fixture. It does not read your repository. Public requests run deterministic checks in `RULES_ONLY` mode. Configured judge credentials enable bounded Nebius review; missing configuration or exhausted budget fails closed.

For real native Cursor interception, install the **local guard and extension together**:

```sh
npm ci
npm run demo:ready -- /tmp/al-settings-demo
```

This creates a new disposable sample, installs the extension, starts the local checker and opens Cursor. It never approves an action. macOS/Linux and Node 24 are required; the destination must not exist. See [native setup and removal](docs/NATIVE-GUARD.md).

## What happens to a request

1. A transport receives the proposed tool call and explanation.
2. The shared engine checks operation/path grants, evidence coverage and protected JSON fields.
3. Hard denials and incomplete evidence skip model inference. Eligible configured LIVE requests use **NVIDIA Nemotron 3 Super through Nebius Token Factory**, with structured output validated locally.
4. MCP returns an advisory result. In native mode, eligible mutations wait for an explicit, one-time human decision; the guard rechecks file state before allowing the original call.

A plausible explanation cannot override policy. A model failure is not permission. An MCP recommendation is never execution authorization.

## Repository map

| Location             | Responsibility                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `packages/core`      | Tool contracts, effect analysis, evidence, deterministic decisions, model prompt and Nebius adapter |
| `packages/mcp`       | Transport-independent review service, policy and identity, local MCP transport                      |
| `packages/companion` | Cursor hooks service, local history, durable local budget, waiting approvals and diagnostics        |
| `packages/extension` | Cursor sidebar, chat grouping, review dialogs and status presentation                               |
| `apps/site`          | Landing page, judge/privacy guides and hosted MCP route                                             |
| `scripts`            | Deliberate project setup and sample launchers                                                       |
| `tests`              | Core, guard, MCP, transport and spending-boundary regression tests                                  |
| `fixtures`           | Synthetic development cases; not a held-out benchmark                                               |
| `docs`               | Architecture, deployment, security boundaries and release plan                                      |

No policy logic belongs in the extension or landing page. Changes to the shared engine reach both transports through imports, with contract tests protecting the boundary.

## Development

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run extension:package
npm run dev
```

Open the local URL printed by Next.js. Do not put keys in the browser, extension settings, source control, or client MCP configuration. Optional server variables are documented in `.env.example`.

## Limits, stated plainly

- Hosted MCP is advisory and uses server-owned sample evidence. It cannot pause native Cursor tools.
- Native protection covers supported hook-delivered operations only. Search, partial edits, manual edits, Tab, and parallel activity are not comprehensively covered. Unsupported delivered operations are logged and denied.
- The local checker is not an operating-system sandbox. Same-user processes and writable project hooks remain in the trust boundary.
- Rules-only output means semantic review was **not measured**. We make no new benchmark accuracy claim in this release.
- The local stdio launcher is rules-only. LIVE is available through the configured native companion or hosted judge service.

## Documentation

[Architecture](docs/ARCHITECTURE.md) · [Judge guide](docs/JUDGE-GUIDE.md) · [Native setup](docs/NATIVE-GUARD.md) · [Deployment and publishing](docs/DEPLOYMENT.md) · [Release plan](PLAN.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Provenance](docs/PROVENANCE.md)

The original development history and benchmark work remain in their existing repositories. This is a focused release extraction, not a claim that all the work was newly implemented here.
