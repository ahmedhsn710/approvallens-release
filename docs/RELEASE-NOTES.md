# ApprovalLens 0.6.0 — shell inspection and sensitive-data checks

- Opt-in structured shell inspection: literal quoting, pipelines, command lists and bounded read-only adapters for cat, head, tail, wc, grep -F and pwd. Every branch and input file must pass policy; unresolved operations stay blocked.
- Sensitive-data checks on supported native reads and outgoing MCP/Nebius review evidence. Repository blocked terms complement known credential patterns. Matched values are not echoed in diagnostics.
- Product-focused website, separate setup/verification and judge pages, and consolidated guidance.
- Bundled installation remains one extension plus explicit workspace enablement. No separate terminal service is required.

279 functional tests pass. macOS/Linux, single local workspace. Arbitrary scripts, network shell commands, redirections and unsupported host tools remain outside allowed coverage. Detection is not a sandbox or zero-egress guarantee. Hosted AI remains a credentialed, quota-limited pilot.
