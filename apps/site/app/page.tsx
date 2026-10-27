"use client";
import { useState } from "react";
const repo = "https://github.com/ahmedhsn710/approvallens-release";
function Mark() {
  return (
    <svg
      width="26"
      height="29"
      viewBox="0 0 26 29"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M13 2 24 6v9c0 5-6 10-11 12C8 25 2 20 2 15V6L13 2Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="m8 14 3 3 7-8" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
const cases = [
  {
    name: "Permitted change",
    strict: "true",
    retries: "1",
    status: "Ready for review",
    note: "Protected value preserved. Native execution still needs your approval.",
    tone: "safe",
  },
  {
    name: "Hidden extra change",
    strict: "true",
    retries: "99",
    status: "Blocked by policy",
    note: "preserve-retries failed. A reassuring explanation cannot override this rule.",
    tone: "blocked",
  },
  {
    name: "Unknown action",
    strict: "—",
    retries: "—",
    status: "Evidence incomplete",
    note: "An opaque shell command cannot be certified from its description.",
    tone: "unknown",
  },
];
export default function Home() {
  const [active, setActive] = useState(1);
  const [copied, setCopied] = useState(false);
  const example = cases[active];
  async function connect() {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(
          {
            mcpServers: { approvallens: { url: location.origin + "/api/mcp" } },
          },
          null,
          2,
        ),
      );
      setCopied(true);
    } catch {
      location.href = "/guide";
    }
  }
  return (
    <>
      <header>
        <a className="brand" href="/" aria-label="ApprovalLens home">
          <Mark />
          ApprovalLens<span className="beta">BETA</span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#how">How it works</a>
          <a href="/guide">Judge guide</a>
          <a href={repo}>Source ↗</a>
        </nav>
        <a className="nav-cta" href="/guide">
          Get started <span>↗</span>
        </a>
      </header>
      <main>
        <section className="hero">
          <div className="eyebrow">
            <span className="dot" /> BUILT FOR THE AGENTIC WORKFLOW
          </div>
          <div className="hero-grid">
            <div>
              <h1>
                Proof before
                <br />
                <em>permission.</em>
              </h1>
              <p className="lede">
                Your agent explains what it wants to do.
                <br />
                ApprovalLens checks what it’s actually asking.
              </p>
              <div className="actions">
                <a
                  className="primary"
                  href="https://open-vsx.org/extension/ahmedhsn710/approvallens-cursor"
                >
                  Install the extension ↗
                </a>
                <button className="secondary" onClick={connect}>
                  {copied ? "Configuration copied ✓" : "Copy sample MCP config"}{" "}
                  <span>↗</span>
                </button>
                <a className="secondary" href="/guide">
                  Take the judge walkthrough →
                </a>
              </div>
              <p className="micro">
                Install the extension. Enable your workspace. Review before
                execution.
              </p>
            </div>
            <aside className="hero-note">
              <span className="note-index">01 / THE TRUST GAP</span>
              <p>
                “Just enabling
                <br />
                strict mode.”
              </p>
              <div className="note-line" />
              <small>
                That sounds reasonable.
                <br />
                But what else changed?
              </small>
              <span className="down-arrow">↙</span>
            </aside>
          </div>
          <div className="review-window">
            <div className="window-bar">
              <div className="window-dots">
                <i />
                <i />
                <i />
              </div>
              <span>
                settings.json <b>/</b> independent review
              </span>
              <span className="window-badge">ILLUSTRATIVE WALKTHROUGH</span>
            </div>
            <div
              className="window-tabs"
              role="tablist"
              aria-label="Example review"
            >
              <span>Explore a proposal</span>
              {cases.map((c, i) => (
                <button
                  key={c.name}
                  role="tab"
                  aria-selected={active === i}
                  onClick={() => setActive(i)}
                >
                  {c.name}
                </button>
              ))}
            </div>
            <div className="review-grid">
              <div className="code-pane">
                <div className="pane-label">
                  PROPOSED OPERATION <span>write_file</span>
                </div>
                <pre>
                  <span className="line-num">01</span> {"{"}
                  <br />
                  <span className="line-num">02</span> {"  "}"compilerOptions":{" "}
                  {"{"}
                  <br />
                  <span className="line-num">03</span> {"    "}"strict":{" "}
                  <span className="changed">{example.strict}</span>,<br />
                  <span className="line-num">04</span> {"    "}"retries":{" "}
                  <span className={active === 1 ? "danger" : "value"}>
                    {example.retries}
                  </span>
                  <br />
                  <span className="line-num">05</span> {"  }"}
                  <br />
                  <span className="line-num">06</span> {"}"}
                </pre>
                <div className="code-caption">
                  {active === 2
                    ? "Shell is opaque; no JSON proposal is assumed."
                    : "Original retries: 1 · Developer-owned baseline"}
                </div>
              </div>
              <div className="findings">
                <div className="pane-label">
                  APPROVALLENS FINDINGS <Mark />
                </div>
                <div className={"verdict " + example.tone}>
                  <span>{active === 1 ? "×" : active === 2 ? "?" : "✓"}</span>
                  {example.status}
                </div>
                <p>{example.note}</p>
                <div className="evidence-row">
                  <span>Scope check</span>
                  <b>{active === 2 ? "Unassessed" : "Exact path grant"}</b>
                </div>
                <div className="evidence-row">
                  <span>Model authority</span>
                  <b>Cannot override policy</b>
                </div>
                <div className="evidence-row">
                  <span>Execution</span>
                  <b>Never automatic</b>
                </div>
                <p className="micro">
                  Interactive illustration. No files are read or modified here.
                </p>
              </div>
            </div>
          </div>
          <div className="technology">
            <span>INDEPENDENT BY DESIGN</span>
            <strong>NVIDIA Nemotron</strong>
            <i>+</i>
            <strong>Nebius Token Factory</strong>
            <i>+</i>
            <strong>Model Context Protocol</strong>
          </div>
        </section>
        <section className="principle" id="how">
          <div className="section-kicker">02 / FROM CLAIM TO EVIDENCE</div>
          <h2>
            A second opinion.
            <br />
            <span>A different source of truth.</span>
          </h2>
          <div className="steps">
            <article>
              <span className="step-number">01</span>
              <h3>Check the boundaries.</h3>
              <p>
                Exact permissions and protected JSON fields are checked first.
                Hard violations stop here, without spending model tokens.
              </p>
              <div className="step-tag">DETERMINISTIC POLICY</div>
            </article>
            <article>
              <span className="step-number">02</span>
              <h3>Inspect the explanation.</h3>
              <p>
                When live review is enabled, Nemotron compares the proposed
                effects with the agent’s explanation and the configured task.
              </p>
              <div className="step-tag">GROUNDED MODEL REVIEW</div>
            </article>
            <article>
              <span className="step-number">03</span>
              <h3>Keep the decision.</h3>
              <p>
                MCP returns an advisory report. The native Cursor guard can hold
                a supported call until you approve or reject it.
              </p>
              <div className="step-tag">HUMAN AUTHORIZATION</div>
            </article>
          </div>
        </section>
        <section className="two-paths">
          <div className="section-kicker">03 / MEET YOUR WORKFLOW</div>
          <div className="paths-heading">
            <h2>
              Install. Enable.
              <br />
              Decide with evidence.
            </h2>
            <p>
              Start with the Cursor extension.
              <br />
              Try the hosted sample without installing.
            </p>
          </div>
          <div className="path-grid">
            <article>
              <span className="path-symbol">↗</span>
              <div className="path-type">NO LOCAL SERVER</div>
              <h3>Hosted MCP</h3>
              <p>
                Connect an MCP client and review proposals against the
                server-owned sample policy. Structured findings, explicit
                limitations, no execution.
              </p>
              <a href="/guide">
                Connect & run the three scenes <span>→</span>
              </a>
            </article>
            <article className="native">
              <span className="path-symbol">
                <Mark />
              </span>
              <div className="path-type">LOCAL CURSOR INTEGRATION</div>
              <h3>Native approval guard</h3>
              <p>
                Group activity by chat, inspect policy evidence, and decide on a
                waiting Read, Write or Delete call. The extension installs its
                hooks and bundled companion for you.
              </p>
              <a href={repo + "/releases"}>
                Get the extension & source <span>↗</span>
              </a>
            </article>
          </div>
        </section>
        <section className="honest">
          <div>
            <div className="section-kicker">04 / CLEAR BOUNDARIES</div>
            <h2>
              Evidence, not
              <br />a safety guarantee.
            </h2>
          </div>
          <ul>
            <li>
              <b>No silent permission.</b> Model output never grants execution
              authority.
            </li>
            <li>
              <b>No invented context.</b> Missing evidence is reported as
              unknown.
            </li>
            <li>
              <b>No universal interception claim.</b> Built-in search and
              unsupported tool paths may bypass host hooks.
            </li>
            <li>
              <b>No hidden benchmark score.</b> Functional tests are not
              independently labeled accuracy results.
            </li>
          </ul>
        </section>
        <section className="closing">
          <div className="eyebrow">NEBIUS × NVIDIA GLOBAL AI HACKATHON</div>
          <h2>
            See the action.
            <br />
            <em>Then decide.</em>
          </h2>
          <a className="primary" href="/guide">
            Open the judge guide <span>↗</span>
          </a>
          <p>One workspace. Explicit rules. Decisions you can inspect.</p>
        </section>
      </main>
      <footer>
        <a className="brand" href="/">
          <Mark />
          ApprovalLens
        </a>
        <span>Open source · MIT · Development beta</span>
        <div>
          <a href={repo}>GitHub ↗</a>
          <a href="/privacy">Privacy & boundaries</a>
        </div>
      </footer>
      <div className="copy-status" role="status">
        {copied
          ? "MCP configuration copied. Paste into your client’s MCP settings."
          : ""}
      </div>
    </>
  );
}
