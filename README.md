# ApprovalLens — proof before permission

A Cursor extension that checks supported agent file operations against developer-owned rules, gathers evidence, and holds sensitive operations for human approval. NVIDIA Nemotron through Nebius Token Factory provides an optional hosted second opinion. A model cannot override policy or authorize execution.

[Install from Open VSX](https://open-vsx.org/extension/ahmedhsn710/approvallens-cursor) · [Website](https://approvallens-release.vercel.app) · [Setup guide](docs/EXTENSION-SETUP.md) · [Judge walkthrough](docs/JUDGE-GUIDE.md) · [Release downloads](https://github.com/ahmedhsn710/approvallens-release/releases)

## Start in Cursor

1. Install ApprovalLens **0.6.0 or newer**. If the registry still shows an older version, install the 0.6.0 VSIX from GitHub Releases. Open one trusted local project on macOS or Linux.
2. Run **ApprovalLens: Enable for this workspace** and confirm. The extension bundles the companion and installs project hooks, an editable rules file, and the public MCP configuration. No separate Node installation, clone, or terminal service is required.
3. Edit `.approvallens/rules.json`, then run **ApprovalLens: Apply rules**. The starter permits only reading `package.json`. Exact path grants are intentional; unsupported operations are denied.
4. Use a supported native Read, whole-file Write, or Delete. Ordinary permitted reads pass locally; eligible mutations wait for your decision. Activity is grouped by chat.
5. For Nemotron findings, run **ApprovalLens: Connect hosted review** with a privately supplied pilot credential. The token goes into editor SecretStorage. Anonymous installs work in rules-only mode; the pilot has a shared bounded inference quota.

Cursor may ask you to enable the configured MCP or start a new chat. Disable the workspace integration before uninstalling the extension so owned hooks are removed.

## How it works

```text
Cursor preToolUse → bundled local companion → applied policy + observed file evidence
                                              ↓ eligible LIVE review
                                      hosted MCP → Nebius Nemotron
                                              ↓ validated findings
                     human decision ← extension dialog
                            ↓ recheck file state
                     allow or deny the waiting native call
```

Hard policy violations and incomplete evidence stop locally. Rules-only reviews explicitly say no model ran. The hosted server returns advisory findings, never an execution grant. The independent public MCP sample uses synthetic files and cannot inspect your workspace.

## Boundaries

This is a restrictive development beta, not a universal agent firewall. Supported adapters cover Read/whole-file Write/Delete. Selected literal read-only shell commands are available through opt-in shell inspection. Patches and other unsupported hook-delivered calls are denied. Built-in search may not deliver compatible hooks and therefore cannot be promised interception or logging. No separate small-model classifier exists: routing is deterministic. Single local folder only; Windows, remote workspaces and multi-root are not supported by bundled onboarding.

The applied rules snapshot lives outside the repository. Changes to the editable file require explicit application. Supported agent writes to ApprovalLens and Cursor security configuration are blocked. This is not an OS sandbox or protection against another process running as your user.

## Repository map

| Location               | Responsibility                                                |
| ---------------------- | ------------------------------------------------------------- |
| `packages/core`        | Shared analysis, evidence and review validation               |
| `packages/mcp`         | Policy, reviewer, MCP transports and hosted-review client     |
| `packages/companion`   | Native hook controller, local decisions and persistence       |
| `packages/extension`   | Cursor commands, bundled setup, chat activity and approval UI |
| `apps/site`            | Product site, guide and Vercel MCP route                      |
| `tests`                | Policy, transport, lifecycle and integration regressions      |
| `scripts`              | Build, package, development services and demonstrations       |
| `examples`, `fixtures` | Synthetic policies and reproducible scenarios                 |

## Develop

Node 24+ is required for repository development, not for installed extension users.

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run extension:package
```

The package command bundles the companion, policy parser and hook. Install the generated VSIX in a disposable project to verify actual editor behavior. See [contributor guide](CONTRIBUTING.md) for ownership and validation, [architecture](docs/ARCHITECTURE.md) for trust boundaries, [deployment](docs/DEPLOYMENT.md) for secrets and publishing, and [plan](PLAN.md) for outstanding work.

## Evidence and license

Automated functional tests do not establish benchmark accuracy. Verification status and remaining external dependencies are recorded in [release status](docs/RELEASE-STATUS.md). Original research provenance is in [provenance](docs/PROVENANCE.md). MIT licensed; see [LICENSE](LICENSE).

## Shell and data checks

Version 0.6.0 adds opt-in read-only shell pipelines, command lists and argument checks, plus sensitive-data inspection before supported reads and remote review transmission. See [shell and egress](docs/SHELL-AND-EGRESS.md) for exact coverage. Follow the [setup guide](https://approvallens-release.vercel.app/guide) for practical verification cases; the [judge walkthrough](https://approvallens-release.vercel.app/judges) is separate.
