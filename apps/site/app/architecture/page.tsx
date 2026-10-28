import Link from "next/link";

function Flow({ label, steps }: { label: string; steps: string[] }) {
  return (
    <figure className="architecture-flow" aria-label={label}>
      <figcaption>{label}</figcaption>
      <ol>
        {steps.map((step, i) => (
          <li key={step}>
            <span>{String(i + 1).padStart(2, "0")}</span>
            {step}
          </li>
        ))}
      </ol>
    </figure>
  );
}
export default function Architecture() {
  return (
    <>
      <header>
        <Link className="brand" href="/">
          ◈ ApprovalLens
        </Link>
        <Link className="nav-cta" href="/guide">
          Get started →
        </Link>
      </header>
      <main className="guide">
        <div className="section-kicker">TECHNICAL SPECIFICATION / 0.7</div>
        <h1>
          Local control.
          <br />
          <em>Grounded advice.</em>
        </h1>
        <p className="lede">
          ApprovalLens separates permission, evidence and interpretation. The
          model explains eligible actions. Your applied policy and your decision
          control the supported native approval boundary.
        </p>
        <section>
          <h2>One extension. Two trust boundaries.</h2>
          <Flow
            label="On your computer · enforcement boundary"
            steps={[
              "Cursor delivers a native tool event",
              "Bundled hook sends it to the local companion",
              "Exact grants, constraints and sensitive-data checks",
              "Eligible action waits for review",
              "You approve or reject in Cursor",
              "State recheck, then permission returned to Cursor",
            ]}
          />
          <Flow
            label="Hosted service · advisory boundary"
            steps={[
              "Local evidence is minimized and scanned",
              "Authenticated MCP request reaches Vercel",
              "NVIDIA Nemotron Super runs on Nebius Token Factory",
              "Structured findings are validated locally",
              "Findings inform your decision; the server cannot execute",
            ]}
          />
          <p>
            Hard denials stop locally and skip inference. Ordinary supported
            reads can pass locally. LIVE review failures, invalid replies,
            timeouts and rejected decisions do not grant permission. Approval
            and the subsequent host-reported outcome are recorded separately.
          </p>
        </section>
        <section>
          <h2>Project rules, with a deliberate application step</h2>
          <Flow
            label="Suggested rules are proposals, never authority"
            steps={[
              "Detect stack from file names; exclude hidden and sensitive paths",
              "Developer selects up to 40 paths and supplies task intent",
              "Preview the exact inventory before transmission",
              "Nemotron proposes minimal read/write grants with reasons",
              "Validate every grant against the selected paths",
              "Review draft, save rules, explicitly apply",
            ]}
          />
          <p>
            No source contents or manifest contents are uploaded for
            suggestions. The inventory is bounded and skips symlinks and common
            generated directories. Existing restrictions are retained in the
            draft. Suggestions cannot introduce delete grants or enable shell
            inspection; active rules remain unchanged until explicitly applied.
            File names and task intent can still be sensitive, so preview them
            before sending.
          </p>
        </section>
        <section>
          <h2>What each component owns</h2>
          <div className="spec-table">
            <table>
              <thead>
                <tr>
                  <th>Component</th>
                  <th>Responsibility</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Cursor extension · CommonJS</td>
                  <td>
                    Workspace setup, sidebar, approval UI and editor
                    SecretStorage.
                  </td>
                </tr>
                <tr>
                  <td>Bundled local companion · TypeScript</td>
                  <td>
                    Private Unix socket, tool normalization, trusted policy
                    snapshot, pending decisions and bounded activity.
                  </td>
                </tr>
                <tr>
                  <td>Shared core · TypeScript + Zod</td>
                  <td>
                    Exact operation/path grants, shell analysis, JSON evidence,
                    field constraints, egress inspection and output validation.
                  </td>
                </tr>
                <tr>
                  <td>Hosted MCP · Next.js on Vercel</td>
                  <td>
                    Stateless Streamable HTTP POST at /api/mcp. Authenticated
                    evidence review and rule suggestions; public synthetic
                    samples.
                  </td>
                </tr>
                <tr>
                  <td>Nebius Token Factory</td>
                  <td>
                    OpenAI-compatible inference using
                    nvidia/nemotron-3-super-120b-a12b with structured JSON
                    output.
                  </td>
                </tr>
                <tr>
                  <td>Upstash Redis</td>
                  <td>
                    Durable aggregate call reservations in capped mode. Explicit
                    owner-configured uncapped testing mode bypasses this
                    counter; authentication remains required.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
        <section>
          <h2>Evidence and data handling</h2>
          <p>
            Hosted action review receives task intent, agent explanation, paths
            and supported evidence. Raw write bodies are omitted. JSON field
            values are disclosed only through explicit policy schemas. Vercel
            receives client-observed evidence and cannot independently verify
            the local filesystem. Results are advisory and marked
            non-executable.
          </p>
          <p>
            The companion validates model findings against its analysis. Exact
            field-preservation constraints are enforced deterministically; the
            model cannot override them. Arbitrary source-code behavior is not
            proven by this analysis.
          </p>
          <ul>
            <li>
              Workspace: editable rules plus owned Cursor hooks and MCP
              configuration.
            </li>
            <li>
              User state outside the project: applied policy, activity and the
              local socket.
            </li>
            <li>Editor SecretStorage: the hosted access credential.</li>
            <li>
              Vercel production secrets: Nebius API key, pinned model and access
              credential.
            </li>
          </ul>
        </section>
        <section>
          <h2>Supported operations and bounds</h2>
          <p>
            This release supports one trusted local workspace on macOS or Linux.
            Native Read, whole-file Write and Delete have adapters. Opt-in shell
            inspection recognizes selected literal read-only commands and checks
            every stage and branch against exact file grants.
          </p>
          <p>
            Arbitrary scripts, package managers, redirects and network-capable
            shell operations remain unsupported. Search and other host paths may
            not deliver hook events. This is not an OS sandbox, universal
            interception or a zero-egress guarantee.
          </p>
          <p>
            Hosted requests are bounded to 32 KiB. Inference uses a 45-second
            provider timeout and at most 1,800 output tokens. Required review
            failure denies the action. Pending native decisions expire rather
            than automatically approving.
          </p>
        </section>
        <section>
          <h2>Inspect the implementation</h2>
          <p>
            <a href="https://github.com/ahmedhsn710/approvallens-release">
              Source, tests and MIT license ↗
            </a>{" "}
            · <Link href="/guide">Installation</Link> ·{" "}
            <Link href="/privacy">Privacy</Link> ·{" "}
            <Link href="/judges">Evaluation guide</Link>
          </p>
        </section>
      </main>
    </>
  );
}
