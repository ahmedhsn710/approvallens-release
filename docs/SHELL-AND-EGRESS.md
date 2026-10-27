# Shell inspection and outbound data — first increment

## Delivered

The core has two transport-independent components: `shell-inspection.ts` recognizes a deliberately tiny literal command language; `egress.ts` blocks detected credentials and repository-defined sensitive terms. Neither executes a command or asks a model to certify arbitrary shell behavior.

Enable shell inspection by adding `"shellInspection": true` to repository rules and explicitly applying them. The parser handles literal single/double quotes, escaped characters, multiple file operands, pipelines, `&&`, `||`, semicolons, newlines and comments. It checks **every branch**, including a branch that might not execute, rather than trusting short-circuit assumptions.

Supported system executable adapters are `cat`, `head`, `tail`, `wc`, fixed-string `grep -F`, and `pwd`, under `/bin/` or `/usr/bin/`. Each has an explicit option allowlist. Files in every stage must pass exact grants, workspace/symlink checks, sensitive-data scanning and a final state recheck. Critical-read paths require a separate native Read review. Unbound stdin, follow mode, recursive search and file-loading options are denied. Inspection is bounded to 4,096 command characters, 16 commands, 32 distinct files, 1 MiB per file and 4 MiB total scanned content.

Examples, after granting reads for `src/example.txt` and `README.md`:

```sh
/bin/cat "src/example.txt" README.md
/bin/cat README.md | /usr/bin/grep -F -n "setup" | /usr/bin/head -n 20
/bin/pwd && /usr/bin/wc -l README.md
```

Bare commands are intentionally unresolved: `cat` can be a function, alias or PATH replacement. The hook does not rewrite commands or control the launched environment. Absolute executables remain within the trusted system boundary; the guard does not hash OS binaries or isolate shell startup files. Working directory must match the configured project root.

Unsupported requests now have specific classifications: network transfer, filesystem mutation, repository-tool execution, arbitrary code execution, unresolved executable, expansion, redirection, background execution, syntax error and resource bounds. A clean content scan cannot turn one into an allow. Redirections, here-documents, substitutions, globs, scripts, Git helpers and package-manager hooks still require separate effects/containment adapters. This is a conservative parser for an accepted shell subset, not a claim to implement all Bash, Zsh, Fish or PowerShell semantics.

Example additions to an existing policy:

```json
{
  "shellInspection": true,
  "blockedTerms": ["PROJECT-PRIVATE-CANARY", "internal-customer-reference"]
}
```

`blockedTerms` contains case-insensitive literal terms, not regular expressions. Do not put real credentials into a version-controlled rules file. Use policy-owned classification markers or non-secret identifiers. These additions do not grant file access; keep the existing `grants` list.

## Outbound boundaries

- Native file reads are scanned before permission because returning a file to a coding agent can transmit its content to the agent's provider. Binary, invalid UTF-8 and oversized reads are not supported.
- Native shell/external tool arguments are inspected for known credential formats. Unsupported external tools remain denied even when the content scan passes. A clean scan is not an allow decision.
- Eligible semantic evidence is checked against repository blocked terms before reserving a local review call.
- The hosted MCP client checks its sanitized payload before network transmission. Raw write bodies remain omitted.
- The hosted private route checks inbound evidence before reserving provider quota; the Nebius adapter checks its final payload before calling the provider.
- Diagnostics contain categories, never matched sensitive values. Detection includes private keys, several provider token formats, credential fields/assignments, bearer tokens and credentials embedded in URLs.

This is a conservative detection layer, not a guarantee that no sensitive information leaves the machine. Encoded secrets, arbitrary personal data and unusual credential formats can evade pattern checks. A file can change between inspection and native execution. Host hooks cannot constrain shell startup behavior or other same-user processes. Tools that bypass hooks, manual uploads and unrelated network traffic are outside coverage. Stronger guarantees require host-enforced execution/network isolation.

## Next implementation slices

1. Project-profile suggestions and task-specific scopes, with explicit developer acceptance; do not auto-grant broad paths.
2. Extend the accepted grammar and verified command adapters; use a maintained full-language parser when adding complex control structures, with differential tests and fail-closed fallback.
3. Trusted external-tool adapters bound to server identity, exact tool schema and destination; separate destination permission from data-release permission. Do not allow a tool solely by its name or URL string in arguments.
4. Restricted execution for tests/builds/package managers; arbitrary native shell remains denied until that exists.
5. Evaluate legitimate workflows, false positives and abstentions on independent fixtures before making accuracy claims.

## Smoke verification

Focused cases cover literal inspection, chaining/substitution/redirection rejection, granted and ungranted reads, sensitive file reads, working-directory mismatch, external-tool denial and zero network calls for a sensitive remote request. No paid inference is needed for these checks.

## Grammar reference

The distinction between literal arguments and dynamic execution follows the [Bash reference manual](https://www.gnu.org/software/bash/manual/bash.html), especially shell expansions, pipelines and redirections. Parsing syntax alone never proves arbitrary program behavior safe.

## Current verification

41 focused shell/egress checks passed, including a real harmless `cat | grep -F | wc` pipeline executed only in a disposable fixture after the controller allowed it. Denial cases include hidden network stages, ungranted conditional branches, sensitive data piped into a filter, symlinks, critical-read paths, dynamic syntax and unsafe flags. These are functional regressions, not benchmark accuracy results or a live Cursor chat test.
