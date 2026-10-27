import Link from "next/link";
export default function Guide() {
  return (
    <>
      <header>
        <Link className="brand" href="/">
          ◈ ApprovalLens
        </Link>
        <a
          className="nav-cta"
          href="https://open-vsx.org/extension/ahmedhsn710/approvallens-cursor"
        >
          Install extension ↗
        </a>
      </header>
      <main className="guide">
        <div className="section-kicker">CURSOR SETUP / JUDGE WALKTHROUGH</div>
        <h1>
          One install.
          <br />
          <em>Your decisions.</em>
        </h1>
        <p className="lede">
          Enable a project, apply your rules, and review supported agent actions
          before they run. The local companion is included.
        </p>
        <section>
          <h2>1. Install and enable</h2>
          <p>
            Install ApprovalLens from Open VSX in Cursor. Open one trusted local
            folder on macOS or Linux, then run{" "}
            <b>ApprovalLens: Enable for this workspace</b>. Confirm the setup.
            No repository clone, Node installation or terminal service is
            required.
          </p>
          <p>
            The extension adds project hooks, a public MCP entry and{" "}
            <code>.approvallens/rules.json</code>. Cursor may require trusting
            the MCP entry or starting a new chat.
          </p>
        </section>
        <section>
          <h2>2. Set a narrow scope</h2>
          <p>
            Start in a disposable folder with a file named <code>demo.txt</code>
            . Edit your rules using the example below, then run{" "}
            <b>ApprovalLens: Apply rules</b> and confirm. Editing alone does not
            change the active policy.
          </p>
          <pre>
            {JSON.stringify(
              {
                version: 1,
                taskId: "demo",
                developerIntent: "Update demo.txt. Preserve other files.",
                grants: [
                  { operation: "read_file", path: "demo.txt" },
                  { operation: "write_file", path: "demo.txt" },
                ],
              },
              null,
              2,
            )}
          </pre>
        </section>
        <section>
          <h2>3. Watch a native call wait</h2>
          <p>
            Ask Cursor to use a native whole-file Write to replace demo.txt with
            a short sentence. Inspect the ApprovalLens dialog and reject once.
            Confirm the file is unchanged. Repeat and approve once: Cursor
            should continue and write the file. The sidebar groups activity by
            chat.
          </p>
          <p>
            Hard policy violations stop locally. Ordinary granted reads can pass
            locally. Eligible sensitive operations require a decision; closing
            the dialog rejects them.
          </p>
        </section>
        <section>
          <h2>4. Connect live findings</h2>
          <p>
            Run <b>ApprovalLens: Connect hosted review</b> and enter a privately
            supplied pilot credential after reading the data disclosure. It is
            stored in editor SecretStorage, not repository configuration.
            Eligible evidence goes through hosted MCP to NVIDIA Nemotron on
            Nebius. The model provides findings; your local guard retains
            authority.
          </p>
          <p>
            Without a credential the extension clearly displays RULES_ONLY. The
            current pilot has a limited shared quota, not unlimited public
            inference. Failure or exhausted quota does not silently permit an
            operation.
          </p>
        </section>
        <section>
          <h2>A three-minute presentation</h2>
          <ol>
            <li>First 40 seconds: show the rules and project setup.</li>
            <li>
              Next 50 seconds: trigger a supported write, inspect findings and
              reject.
            </li>
            <li>
              Next 50 seconds: repeat, approve and verify the actual file.
            </li>
            <li>
              Final 40 seconds: show mode, policy denial and coverage limits.
            </li>
          </ol>
        </section>
        <section>
          <h2>Try the engine without installing</h2>
          <p>
            The homepage’s sample MCP configuration connects to{" "}
            <code>https://approvallens-release.vercel.app/api/mcp</code>. Call{" "}
            <code>approvallens_examples</code>, then{" "}
            <code>approvallens_review</code> with its three scenarios. This
            secondary walkthrough uses synthetic server-owned files and never
            intercepts or executes local tools. Use a separate client if a
            native guard denies an agent-initiated MCP call.
          </p>
        </section>
        <section>
          <h2>Know the boundaries</h2>
          <p>
            Native adapters support Read, whole-file Write and Delete. Shell and
            unsupported delivered calls are denied. Search may bypass host
            hooks. Windows, remote and multi-root workspaces are not supported.
            Disable the workspace integration before uninstalling.
          </p>
          <p>
            This is an evidence review beta, not an OS sandbox or universal
            safety guarantee.
          </p>
          <a href="https://github.com/ahmedhsn710/approvallens-release/blob/main/docs/EXTENSION-SETUP.md">
            Detailed setup and troubleshooting ↗
          </a>
          <p>
            <Link href="/privacy">Privacy and limitations →</Link>
          </p>
        </section>
      </main>
    </>
  );
}
