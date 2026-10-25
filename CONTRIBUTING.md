# Contributing

Use Node 24 and `npm ci` from the repository root. Work in a branch and keep policy behavior changes separate from UI changes. Never commit credentials, local databases, request logs or real user repositories.

Before a pull request: run `npm run typecheck`, `npm test`, `npm run build`, `npm run extension:package`, and `npm run format:check`. Include the concrete failure, changed behavior, test evidence and remaining limitations. A new rule needs a regression case; presentation changes do not need tests that merely repeat markup.

Keep safety decisions in core/service modules. Never make the extension a second classifier. Preserve explicit unknown/NOT_MEASURED results, durable spending reservations and one-time approval binding. Public benchmark labels must not be tuned against and then presented as held-out results.

Two-person ownership: one developer owns core/native behavior and evidence tests; the other owns MCP deployment, extension presentation, docs and release checks. Review changes crossing shared contracts together. Public releases require a passing CI run and an actual installed-package smoke test.
