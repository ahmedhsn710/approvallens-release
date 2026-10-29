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
            Install the latest ApprovalLens extension by ahmedhsn710 and follow
            the <Link href="/guide">setup and verification guide</Link> in a
            disposable Cursor project. The companion and hooks are bundled. The
            primary demonstration is a real native tool call waiting for a human
            decision.
          </p>
          <ol>
            <li>
              Open one trusted local, disposable project in Cursor on macOS or
              Linux. Create a demo.txt file containing “hello world”. Reload the
              window after upgrading the extension.
            </li>
            <li>
              Open the Command Palette (Cmd+Shift+P on macOS, Ctrl+Shift+P on
              Linux). Run <b>ApprovalLens: Enable for this workspace</b> and
              confirm. This installs the bundled hooks, starts the local
              companion and adds the project MCP entry.
            </li>
            <li>
              If Cursor asks to enable or trust the ApprovalLens MCP entry,
              accept it. This alone does not enable hosted model review.
            </li>
            <li>
              Run <b>ApprovalLens: Connect hosted review</b>. Read the
              disclosure, click Connect, then enter the private ApprovalLens
              access token supplied with the submission—not a Nebius API key.
              Wait for “Hosted review configured”. The sidebar should show
              “Rules + Nemotron”.
            </li>
            <li>
              Run <b>ApprovalLens: Suggest project rules</b>. Enter “Read
              demo.txt and update its greeting; preserve all other files.”
              Review the automatically collected paths, stack labels and intent,
              then click <b>Suggest rules</b>. No source contents are uploaded.
            </li>
            <li>
              Review the generated draft and its reasons in the setup output.
              Ensure demo.txt has read_file and write_file grants. Save the
              draft as <code>.approvallens/rules.json</code>. Run{" "}
              <b>ApprovalLens: Apply rules</b>, review the permissions and
              confirm. A suggestion or saved file alone does not activate
              permissions.
            </li>
            <li>
              Run <b>ApprovalLens: Check setup</b> to confirm the companion is
              running. Start a fresh Cursor Agent chat so it picks up the
              project hooks.
            </li>
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
          <h3>Prompt for a hosted review</h3>
          <pre>
            {
              'Read demo.txt, then use the native whole-file Write tool to replace its contents with "hello ApprovalLens". Do not use a shell command, patch tool or fallback. Wait for my approval if prompted.'
            }
          </pre>
          <p>
            The read can pass locally. The eligible write reaches Nemotron
            before asking for your decision. Review the request, evidence and
            model findings in the scrollable panel; the action buttons remain in
            a separate footer. Reject first and check that the file is
            unchanged, then repeat and approve once. Use <b>Inspect action</b>{" "}
            and look for semantic review <b>MEASURED</b> and a model name. A
            human approval panel alone is not proof of hosted inference.
          </p>
          <p>
            A hard policy denial never reaches the model. If you see rules-only
            mode, reconnect hosted review; if the request is blocked, inspect
            its reason and the exact grants. Required hosted failures deny the
            request rather than bypass review. Pending requests can expire while
            you read; an expired approval requires a fresh request.
          </p>
          <h3>Other controls</h3>
          <p>
            <b>Edit rules</b> opens the editable policy; <b>Apply rules</b>{" "}
            activates it after confirmation. <b>Refresh</b> reloads activity,
            grouped by chat. <b>Inspect action</b> opens formatted evidence.{" "}
            <b>Approve once</b> authorizes one eligible request; <b>Reject</b>{" "}
            denies it. <b>Copy demo prompt</b> is available when project prompts
            are configured. <b>Disable for this workspace</b> removes owned
            hooks and the MCP entry; use it before uninstalling. See the{" "}
            <Link href="/guide">full command reference</Link> for details.
          </p>
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
