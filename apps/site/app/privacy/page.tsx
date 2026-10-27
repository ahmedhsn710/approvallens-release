import Link from "next/link";
export default function Privacy() {
  return (
    <>
      <header>
        <Link className="brand" href="/">
          ◈ ApprovalLens
        </Link>
        <Link href="/guide">Setup guide →</Link>
      </header>
      <main className="guide">
        <div className="section-kicker">DEVELOPMENT BETA / DATA BOUNDARIES</div>
        <h1>
          Know what
          <br />
          <em>leaves your machine.</em>
        </h1>
        <section>
          <h2>Hosted MCP</h2>
          <p>
            Requests reach Vercel. Public samples use synthetic inputs. Private
            pilot review accepts explicitly disclosed client-observed evidence.
            Do not submit credentials, personal data or confidential code.
            Public rules-only requests do not call Nebius. Live review sends the
            configured task, agent explanation and policy-disclosed effects,
            including configured JSON field changes, to Nebius. Raw write bodies
            are omitted from the model payload.
          </p>
          <p>
            The application does not intentionally log raw requests.
            Hosting-provider operational logs and metadata may still exist. Live
            call reservations persist as aggregate counters in the configured
            Redis service; they do not contain your proposed code.
          </p>
        </section>
        <section>
          <h2>Local extension</h2>
          <p>
            The sidebar talks to a local companion. Local activity and policy
            evidence may be retained on your device. Hooks must be enabled in
            the inspected workspace. Workspace enablement installs the bundled
            hooks and companion. Remote MCP alone cannot enforce native Cursor
            permissions. The access token is stored in editor SecretStorage.
          </p>
        </section>
        <section>
          <h2>Limits</h2>
          <p>
            Sensitive-data checks detect known credential patterns and
            configured blocked terms; encoded or unfamiliar secrets may evade
            detection. They do not control network traffic outside supported
            hooks. JSON comparisons cover configured fields, not arbitrary
            program behavior. The model can be wrong. The configured task may
            differ from the current chat intent. Unsupported operations are not
            certified safe. Native host-hook coverage is not universal, and
            local same-user processes remain in the trust boundary.
          </p>
        </section>
        <a href="https://github.com/ahmedhsn710/approvallens-release/security/policy">
          Security reporting ↗
        </a>
      </main>
    </>
  );
}
