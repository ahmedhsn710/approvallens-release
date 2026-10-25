import Link from "next/link";
export default function Guide() {
  return (
    <>
      <header>
        <Link className="brand" href="/">
          ◈ ApprovalLens
        </Link>
        <Link
          className="nav-cta"
          href="https://github.com/ahmedhsn710/approvallens-release"
        >
          View source ↗
        </Link>
      </header>
      <main className="guide">
        <div className="section-kicker">
          THE JUDGE WALKTHROUGH / ABOUT 3 MINUTES
        </div>
        <h1>
          Less setup.
          <br />
          <em>More evidence.</em>
        </h1>
        <p className="lede">
          Use the hosted MCP from your client. No local server, repository
          clone, or extension is needed for this walkthrough.
        </p>
        <section>
          <h2>1. Connect the endpoint</h2>
          <p>
            On the homepage, click <b>Connect the MCP</b> to copy the
            configuration with this deployment’s URL. In Cursor, add it under
            MCP settings. Other Streamable HTTP MCP clients can use the same
            endpoint.
          </p>
          <pre>
            {
              '{\n  "mcpServers": {\n    "approvallens": {\n      "url": "https://YOUR-DEPLOYMENT/api/mcp"\n    }\n  }\n}'
            }
          </pre>
          <p>
            The public endpoint runs real deterministic checks in{" "}
            <b>RULES_ONLY</b> mode. It does not pretend a model ran. For LIVE
            review, add the separately supplied judge credential as an
            Authorization bearer header; the server must have Nebius and a
            durable budget configured.
          </p>
        </section>
        <section>
          <h2>2. Discover the sample</h2>
          <pre>
            Call approvallens_examples. Show the policy, baseline and three
            scenarios. Do not execute any proposed operation.
          </pre>
          <p>
            The server owns the synthetic settings.json baseline: strict=false,
            retries=1. Its policy permits enabling strict mode while preserving
            retries. These are sample files, not files on your computer.
          </p>
        </section>
        <section>
          <h2>3. Review three proposals</h2>
          <ol>
            <li>
              <b>Safe change:</b> call approvallens_review using the safe-change
              example. Expect complete JSON evidence with retries preserved.
              Rules-only mode still requires semantic review; it never returns
              execution authorization.
            </li>
            <li>
              <b>Hidden extra change:</b> use protected-change. Expect a
              deterministic preserve-retries violation, even though the
              explanation sounds harmless. No paid model call is needed.
            </li>
            <li>
              <b>Outside scope:</b> use outside-scope. Expect a denial for the
              ungranted .env path. No real .env file is read.
            </li>
          </ol>
          <p>
            Inspect <code>decision</code>, <code>assessment</code>,{" "}
            <code>analysis</code>, <code>semanticReview</code> and{" "}
            <code>executable: false</code>. Unknown and failed results are not
            approval.
          </p>
        </section>
        <section>
          <h2>Optional: native Cursor enforcement</h2>
          <p>
            The extension is a separate local integration. It cannot intercept
            native tools from a cloud server alone. Download the release and
            follow the repository’s native setup guide. macOS/Linux and Node 24
            are required. Supported whole-file operations are held locally;
            search and partial edits are not comprehensively supported.
          </p>
          <a
            className="primary"
            href="https://github.com/ahmedhsn710/approvallens-release/releases"
          >
            Release downloads ↗
          </a>
        </section>
        <section>
          <h2>What this proves—and what it doesn’t</h2>
          <p>
            This is a working policy and evidence review pipeline with a remote
            MCP transport. It is not a full code audit, runtime sandbox,
            prompt-injection immunity claim, or benchmark accuracy claim. No
            action in the hosted judge walkthrough executes code.
          </p>
          <Link href="/privacy">Read privacy and limitations →</Link>
        </section>
      </main>
    </>
  );
}
