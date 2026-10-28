import Link from "next/link";
const policy = {
  version: 1,
  taskId: "verification",
  developerIntent:
    "Inspect demo files and update demo.txt only. Preserve all other files.",
  shellInspection: true,
  grants: [
    { operation: "read_file", path: "demo.txt" },
    { operation: "write_file", path: "demo.txt" },
    { operation: "read_file", path: "sample-credentials.txt" },
  ],
  blockedTerms: ["PROJECT-PRIVATE-CANARY"],
};
export default function Guide() {
  return (
    <>
      <header>
        <Link className="brand" href="/">
          ◈ ApprovalLens
        </Link>
        <Link className="nav-cta" href="/judges">
          Judge guide →
        </Link>
      </header>
      <main className="guide">
        <div className="section-kicker">
          SETUP & VERIFICATION / VERSION 0.7.1
        </div>
        <h1>
          Your workspace.
          <br />
          <em>Your rules.</em>
        </h1>
        <p className="lede">
          Start in a disposable project. Verify a few small actions before
          granting access to real files.
        </p>
        <section>
          <h2>New: suggest rules for your project</h2>
          <p>
            After enabling the workspace and connecting hosted review, run{" "}
            <b>ApprovalLens: Suggest project rules</b>. Describe your task; the
            extension automatically inventories the project. Preview the exact
            paths and stack labels before sending them to Nemotron. No file
            contents are uploaded.
          </p>
          <p>
            Hidden files, likely credential files, symlinks and common generated
            folders are excluded. The current limit is 800 eligible paths and 30
            KB of inventory. Larger inventories stop with an explanation rather
            than silently omit files. Seeing a file does not automatically grant
            permission to change it.
          </p>
          <p>
            Review the unapplied JSON draft and its explanations in the setup
            output. Save the reviewed draft to{" "}
            <code>.approvallens/rules.json</code>, then run <b>Apply rules</b>.
            Existing restrictions are retained. The active guard does not change
            until you apply the rules.
          </p>
          <p>
            <Link href="/architecture">
              Explore the architecture and data flow →
            </Link>
          </p>
        </section>
        <section>
          <h2>1. Install and enable</h2>
          <p>
            In Cursor’s Extensions view, search <b>ApprovalLens</b> by{" "}
            <b>ahmedhsn710</b>. Install version 0.7.1 or newer. If your library
            is still cached,{" "}
            <a href="https://github.com/ahmedhsn710/approvallens-release/releases/tag/v0.7.1">
              download the release VSIX
            </a>{" "}
            and use Install from VSIX.
          </p>
          <p>
            Open one trusted local folder on macOS/Linux. Create{" "}
            <code>demo.txt</code> containing <code>hello world</code> and{" "}
            <code>sample-credentials.txt</code> containing the synthetic text
            below. Never use real credentials for testing.
          </p>
          <pre>{'api_key="abcdefghijklmnop-demo-only"'}</pre>
          <p>
            Run <b>ApprovalLens: Enable for this workspace</b>. Confirm setup.
            The extension starts its bundled companion and adds project hooks,
            an MCP entry and a rules file. Cursor may require a new chat or
            trusting the MCP entry. No separate Node installation or terminal
            service is needed.
          </p>
        </section>
        <section>
          <h2>2. Apply a small policy</h2>
          <p>
            Run <b>ApprovalLens: Edit rules</b>, use this policy, save, then run{" "}
            <b>ApprovalLens: Apply rules</b> and confirm. Merely editing the
            file does not change active permissions.
          </p>
          <pre>{JSON.stringify(policy, null, 2)}</pre>
        </section>
        <section>
          <h2>3. Verify behavior</h2>
          <p>
            Use a fresh Cursor agent chat. Ask it to make exactly the native
            tool call shown, with no fallback, shell wrapping or automatic
            retries. Tests need the actual tool call; a conversational answer is
            not interception evidence.
          </p>
          <table className="guide-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Expected result</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  Native Read of <code>demo.txt</code>
                </td>
                <td>Allowed locally; visible in activity.</td>
              </tr>
              <tr>
                <td>
                  Native whole-file Write of <code>demo.txt</code>
                </td>
                <td>
                  Waits for your decision. Reject first, then repeat and approve
                  once.
                </td>
              </tr>
              <tr>
                <td>
                  Native Read of <code>sample-credentials.txt</code>
                </td>
                <td>
                  Blocked by sensitive-data detection despite the read grant.
                </td>
              </tr>
              <tr>
                <td>
                  Native Write of <code>other.txt</code>
                </td>
                <td>Blocked: no write grant.</td>
              </tr>
              <tr>
                <td>
                  <code>/bin/cat demo.txt | /usr/bin/wc -l</code>
                </td>
                <td>Allowed: supported read-only stages, granted file.</td>
              </tr>
              <tr>
                <td>
                  <code>/bin/pwd || /bin/cat other.txt</code>
                </td>
                <td>
                  Denied: every branch is checked, including conditional reads.
                </td>
              </tr>
              <tr>
                <td>
                  <code>/bin/cat demo.txt &gt; other.txt</code>
                </td>
                <td>Denied: redirection is unsupported.</td>
              </tr>
              <tr>
                <td>
                  <code>curl https://example.com</code>
                </td>
                <td>Denied locally: no network transfer adapter.</td>
              </tr>
            </tbody>
          </table>
          <p>
            For the write test, verify actual file content after both rejection
            and approval. Try a second chat and confirm its activity is grouped
            separately.
          </p>
        </section>
        <section>
          <h2>4. Optional hosted findings</h2>
          <p>
            Run <b>ApprovalLens: Connect hosted review</b>, accept the data
            disclosure and enter a privately supplied pilot token—not a Nebius
            API key. It is saved in editor SecretStorage. Setup checks
            authentication without spending a model call.
          </p>
          <p>
            Hosted AI requires private access and an available provider. Local
            policy checks work without a token. Required LIVE review failures
            deny the action; they do not silently switch to permission. No
            separate classifier model is used.
          </p>
        </section>
        <section>
          <h2>Troubleshooting and removal</h2>
          <p>
            Run <b>ApprovalLens: Check setup</b> and verify your version,
            workspace and running companion. Reload the window after upgrading.
            Shell inspection requires <code>shellInspection: true</code> and
            supported absolute executable paths; bare commands, scripts and
            unknown options are denied.
          </p>
          <p>
            Run <b>ApprovalLens: Disable for this workspace</b> before
            uninstalling. It removes only owned hook/MCP entries and keeps rules
            and audit history. If already uninstalled, remove the ApprovalLens
            hook entries before using native tools again. Windows, remote and
            multi-root workspaces are not supported.
          </p>
          <p>
            <Link href="/privacy">Privacy and coverage limits →</Link>
          </p>
        </section>
        <section>
          <h2>Every extension command, explained</h2>
          <p>
            Find these in Cursor’s Command Palette by typing ApprovalLens.
            Enabling the MCP entry alone does not connect paid hosted inference.
            Connect hosted review requires the private ApprovalLens access
            token, not your Nebius key; wait for the success message.
          </p>
          <div className="spec-table">
            <table>
              <thead>
                <tr>
                  <th>Command</th>
                  <th>What it does</th>
                </tr>
              </thead>
              <tbody>
                {[
                  [
                    "Enable for this workspace",
                    "Adds owned hooks and MCP configuration and starts the bundled local guard. Initially uses local rules only.",
                  ],
                  [
                    "Connect hosted review",
                    "Verifies your private access token, saves it in editor SecretStorage for this project and enables Nemotron review.",
                  ],
                  [
                    "Suggest project rules",
                    "Inventories eligible project paths automatically, previews outgoing metadata and opens an unapplied Nemotron policy draft.",
                  ],
                  [
                    "Edit rules",
                    "Opens .approvallens/rules.json for you to edit. The coding agent cannot grant itself permissions.",
                  ],
                  [
                    "Apply rules",
                    "After confirmation, activates a snapshot of your saved policy. Saving alone does not change the guard.",
                  ],
                  [
                    "Check setup",
                    "Shows the workspace, companion status and configuration locations in ApprovalLens setup output.",
                  ],
                  [
                    "Refresh",
                    "Reloads the activity list. It does not reset policy or approve requests.",
                  ],
                  [
                    "Inspect action",
                    "Shows the selected tool request, observed evidence, findings and outcome.",
                  ],
                  [
                    "Approve once",
                    "Allows one eligible pending request after validation and state checks. Cannot override a hard policy denial.",
                  ],
                  [
                    "Reject",
                    "Denies the pending request; Cursor receives a denial rather than permission to proceed.",
                  ],
                  [
                    "Copy demo prompt",
                    "Copies the demonstration prompt associated with the action, when available.",
                  ],
                  [
                    "Disable for this workspace",
                    "Removes ApprovalLens-owned hooks and MCP entry and stops its guard. Preserves rules and activity history.",
                  ],
                ].map(([name, explanation]) => (
                  <tr key={name}>
                    <td>
                      <b>{name}</b>
                    </td>
                    <td>{explanation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            The advanced socket-path setting is for a manually managed local
            service. Leave it empty for the bundled extension setup.
          </p>
        </section>
      </main>
    </>
  );
}
