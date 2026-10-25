# Judge walkthrough

## Hosted: no local server needed

1. Open the deployment homepage and copy the MCP configuration. Add it to your Streamable HTTP MCP client.
2. Call `approvallens_examples`. Inspect the developer intent, sample baseline and scenarios. These files are synthetic and hosted; your machine is not being accessed.
3. Call `approvallens_review` with the `toolCall` and `agentExplanation` from `safe-change`. Inspect preserved-field evidence. Public mode honestly reports `RULES_ONLY` and `NOT_MEASURED`.
4. Repeat with `protected-change`. The explanation says retries are preserved, but the proposed content changes them. Expect a deterministic block.
5. Repeat with `outside-scope`. Expect a denial of an ungranted `.env` read; no real secret is read.

For configured LIVE testing, use the privately supplied judge bearer token in the MCP client's `Authorization` header. Never publish it. A hard denial still skips inference. Exhausted or unavailable budget returns an error without approval. LIVE availability must be verified on the actual deployment before recording the submission video.

## Native: demonstrate enforcement

Follow [NATIVE-GUARD.md](NATIVE-GUARD.md), then use the sample prompts in the sidebar. A safe whole-file write waits for your explicit review; changing a protected field is denied. Verify the actual sample file afterwards. Do not infer successful execution solely from a review record.

## Suggested three-minute recording

- 0:00–0:25: show the task and deceptive explanation versus actual protected-field change.
- 0:25–1:05: show hosted MCP policy, baseline provenance and deterministic denial.
- 1:05–1:45: show an eligible LIVE review if enabled, including validated evidence and model identity.
- 1:45–2:35: show native Cursor waiting, explicit human approval of a safe change, and the resulting file.
- 2:35–3:00: show tests, architecture and known coverage limits. Do not claim benchmark accuracy from synthetic fixtures.
