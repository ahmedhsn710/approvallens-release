# Shell inspection and outbound data — first increment

## Delivered

The core has two transport-independent components: `shell-inspection.ts` recognizes a deliberately tiny literal command language; `egress.ts` blocks detected credentials and repository-defined sensitive terms. Neither executes a command or asks a model to certify arbitrary shell behavior.

Enable shell inspection by adding `"shellInspection": true` to the repository rules and explicitly applying them. Only `/bin/pwd` and `/bin/cat` with one literal filename are eligible. Cat uses the existing exact read grant, workspace/symlink checks and sensitive-content checks. Paths containing spaces must use single quotes. Working directory must be the configured project root. No PATH lookup, environment overrides, pipelines, redirects, substitutions, scripts, command chains or Git commands are accepted. The setting is off by default.

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
2. A maintained general shell parser plus command-specific effect adapters, still abstaining on unresolved syntax.
3. Trusted external-tool adapters bound to server identity, exact tool schema and destination; separate destination permission from data-release permission. Do not allow a tool solely by its name or URL string in arguments.
4. Restricted execution for tests/builds/package managers; arbitrary native shell remains denied until that exists.
5. Evaluate legitimate workflows, false positives and abstentions on independent fixtures before making accuracy claims.

## Smoke verification

Focused cases cover literal inspection, chaining/substitution/redirection rejection, granted and ungranted reads, sensitive file reads, working-directory mismatch, external-tool denial and zero network calls for a sensitive remote request. No paid inference is needed for these checks.
