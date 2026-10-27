# Delivery plan — extension-first beta

## Implemented

- Shared deterministic policy/evidence engine and structured model review validation.
- Native controller with chat-grouped activity, human decisions and state rechecks.
- Bundled extension runtime, project enable/disable, editable rules and explicit apply.
- Automatic hook/MCP configuration merging and external active-policy snapshot.
- SecretStorage pilot credential and authenticated remote evidence review.
- Public hosted synthetic walkthrough, Vercel deployment and Open VSX release automation.
- Automated setup, transport, policy and lifecycle regression tests.
- Actual Cursor native Write held at an approval dialog and resumed after approval in a disposable project.

## Release acceptance

- [ ] Final formatting, types, tests, site build and VSIX packaging pass for the release commit.
- [ ] New hosted evidence route checked against production with a bounded live call.
- [ ] Updated production site and registry version independently verified.
- [ ] Final artifact installed and setup/disable behavior checked.

Use release status as the evidence ledger; do not equate implementation with production verification.

## Next priorities

1. Broader tool coverage: capture documented real host payloads, add operation-specific adapters and regression fixtures. Never turn unknown tools into automatic allows to improve usability.
2. Public AI onboarding: individual identity and revocation, per-user rate limits/quotas, clear data disclosure and budget management. Current shared pilot token is not a public billing architecture.
3. Evaluation: separately labeled legitimate and deceptive requests, held-out splits, false-positive rates, abstention, latency and cost. Report sample provenance and avoid headline accuracy before independent labeling.
4. Platform support: Windows transport and quoting, remote extension hosts, multi-root ownership, upgrade and uninstall recovery.
5. UX: clearer missing-evidence guidance and measured approval fatigue; retain explicit human control.

## Scope boundaries

No universal interception, arbitrary shell execution approval, complete chat-intent reconstruction or OS sandbox claim. No small-model routing classifier exists. Keep the hosted walkthrough secondary to installed native protection. Legacy manual service commands remain for developers and must not be presented as normal installation steps.
