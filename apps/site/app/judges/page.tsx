import Link from "next/link";
export default function Judges() {
  return (
    <>
      <header>
        <Link className="brand" href="/">
          ◈ ApprovalLens
        </Link>
        <Link className="nav-cta" href="/guide">
          Installation guide →
        </Link>
      </header>
      <main className="guide">
        <div className="section-kicker">NEBIUS × NVIDIA / JUDGE GUIDE</div>
        <h1>
          Proof before
          <br />
          <em>permission.</em>
        </h1>
        <p className="lede">
          A reproducible walkthrough of the native approval boundary,
          deterministic policy and optional hosted model review.
        </p>
        <section>
          <h2>Start with the installed product</h2>
          <p>
            Install version 0.7.0 or newer and follow the{" "}
            <Link href="/guide">setup and verification guide</Link> in a
            disposable Cursor project. The companion and hooks are bundled. The
            primary demonstration is a real native tool call waiting for a human
            decision.
          </p>
          <ol>
            <li>Inspect and explicitly apply project rules.</li>
            <li>
              Request a supported file change. Reject it and verify the file
              remains unchanged.
            </li>
            <li>Approve a legitimate request once and watch Cursor resume.</li>
            <li>
              Try an ungranted path or protected field change and inspect the
              local denial.
            </li>
          </ol>
        </section>
        <section>
          <h2>Where NVIDIA and Nebius fit</h2>
          <p>
            Eligible LIVE reviews call NVIDIA Nemotron through Nebius Token
            Factory using authenticated hosted MCP. The local guard first checks
            policy, bounds evidence and checks outgoing data. Model findings are
            validated; they cannot override a hard denial or authorize
            execution.
          </p>
          <p>
            LIVE requires a privately supplied pilot credential and an available
            hosted provider. Ask the team for access before judging. If hosted
            review is unavailable, LIVE actions fail closed; rules-only mode
            does not demonstrate model inference. A production review has been
            verified, but automated functional tests are not an accuracy
            benchmark.
          </p>
        </section>
        <section>
          <h2>Hosted sample: no installation</h2>
          <p>
            This secondary demo reviews synthetic server-owned files. It cannot
            inspect your project or intercept native calls. Connect any
            compatible Streamable HTTP MCP client:
          </p>
          <pre>
            {JSON.stringify(
              {
                mcpServers: {
                  approvallens: {
                    url: "https://approvallens-release.vercel.app/api/mcp",
                  },
                },
              },
              null,
              2,
            )}
          </pre>
          <p>
            Call <code>approvallens_examples</code>, then{" "}
            <code>approvallens_review</code> for the safe-change,
            protected-change and outside-scope examples. Expect review, block
            and block respectively in anonymous RULES_ONLY mode. Every result is
            non-executable. Use a separate client if the native guard denies
            agent-initiated MCP calls.
          </p>
        </section>
        <section>
          <h2>Evidence and boundaries</h2>
          <p>
            Assess exact scope checks, explicit uncertainty, held requests,
            state rechecks and human authorization. Native search coverage is
            not universal. Shell support covers selected literal read-only
            effects; arbitrary code execution remains blocked. Sensitive-data
            detection is not a zero-egress guarantee.
          </p>
          <p>
            <a href="https://github.com/ahmedhsn710/approvallens-release/blob/main/docs/RELEASE-STATUS.md">
              Verified release evidence ↗
            </a>{" "}
            ·{" "}
            <a href="https://github.com/ahmedhsn710/approvallens-release">
              Source and tests ↗
            </a>
          </p>
        </section>
      </main>
    </>
  );
}
