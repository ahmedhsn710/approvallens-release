# Security boundaries and reporting

This is a hackathon release preview, not a complete sandbox or security guarantee. Hosted results are advisory. Native enforcement depends on Cursor delivering supported hook events and the local guard staying enabled. A process with the same user privileges can tamper with the environment.

Do not put real secrets in sample tool arguments. Keys remain server-side or in the local service environment. The public MCP rejects caller-defined policy, limits body size, checks supplied browser Origin and never executes a tool. Optional LIVE review requires a judge bearer token and a durable budget reservation. Never expose a paid anonymous model relay.

Report security defects privately through GitHub private vulnerability reporting if enabled. Otherwise open a minimal issue asking for a private contact without including exploit details, credentials or private data. Do not post live tokens in issues.

The extension package contains only its presentation code and assets; the native daemon is installed separately. Dependency audit results and remaining advisories should be checked for every release. Development packaging dependencies are not part of the hosted runtime or VSIX.

## Packaging dependency advisory (26 October 2026)

The production-only dependency audit reports no vulnerabilities. The extension packaging/publishing CLI dependency tree currently reports GHSA-xcx6-jx8p-x3h5 through Azure MSAL. This concerns Azure authorization-code flows; the release workflow uses VSIX packaging and Open VSX tokens, not Azure authentication. These development tools are excluded from the hosted runtime and VSIX. Upgrading VSCE to the latest available 4.0.0 did not remove the upstream advisory. Recheck before future releases; do not interpret the production audit as a clean audit of all development tools.
