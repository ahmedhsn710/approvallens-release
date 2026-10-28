const nodes = [
  [420, 20, "REQUEST RECEIVED", "Bind tool, project and chat", "normal"],
  [420, 150, "LOCAL POLICY CHECK", "Scope · constraints · coverage", "normal"],
  [820, 150, "BLOCKED", "Hard denial · no model call", "deny"],
  [20, 280, "PERMITTED READ", "Supported read + data checks pass", "normal"],
  [420, 280, "REVIEW REQUIRED", "Collect and scan eligible evidence", "normal"],
  [420, 410, "MODEL REVIEW", "Validate structured Nemotron findings", "normal"],
  [820, 410, "DENIED / HALTED", "Review failure or blocking result", "deny"],
  [
    420,
    540,
    "WAITING FOR DEVELOPER",
    "Native request remains suspended",
    "wait",
  ],
  [820, 670, "DENIED", "Reject · expiry · changed state", "deny"],
  [420, 670, "RECHECK STATE", "Approval is for this request only", "normal"],
  [420, 800, "RETURN PERMISSION", "Cursor may resume the tool call", "normal"],
  [
    420,
    930,
    "RECORD HOST OUTCOME",
    "Completion or failure is separate",
    "normal",
  ],
] as const;
export default function StateFlow() {
  return (
    <figure className="state-diagram">
      <figcaption>Native action state machine</figcaption>
      <div className="state-diagram-scroll">
        <svg
          viewBox="0 0 1140 1030"
          role="img"
          aria-labelledby="state-title state-description"
        >
          <title id="state-title">
            ApprovalLens native request states and transitions
          </title>
          <desc id="state-description">
            Policy violations block locally. Ordinary permitted reads return
            permission. Eligible sensitive actions pass through optional live
            model review, developer approval and a state recheck. Reject,
            expiry, changed state or required model failure deny the request.
            Host completion is logged separately.
          </desc>
          <defs>
            <marker
              id="state-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#53685a" />
            </marker>
          </defs>
          <g
            fill="none"
            stroke="#53685a"
            strokeWidth="2"
            markerEnd="url(#state-arrow)"
          >
            <path d="M570 100 V150" />
            <path d="M720 190 H820" />
            <path d="M420 190 H170 V280" />
            <path d="M570 230 V280" />
            <path d="M570 360 V410" />
            <path d="M720 450 H820" />
            <path d="M570 490 V540" />
            <path d="M420 320 H355 V580 H420" />
            <path d="M170 360 V840 H420" />
            <path d="M570 620 V670" />
            <path d="M720 580 H970 V670" />
            <path d="M720 710 H820" />
            <path d="M570 750 V800" />
            <path d="M570 880 V930" />
          </g>
          <g className="state-edge-label" fill="#344d3c" fontSize="17">
            <text x="740" y="178">
              violation
            </text>
            <text x="180" y="245">
              ordinary read
            </text>
            <text x="585" y="260">
              eligible
            </text>
            <text x="585" y="392">
              LIVE
            </text>
            <text x="366" y="455" transform="rotate(-90 366 455)">
              RULES ONLY · no inference
            </text>
            <text x="735" y="438">
              failure
            </text>
            <text x="585" y="523">
              valid findings
            </text>
            <text x="585" y="653">
              approve once
            </text>
            <text x="800" y="568">
              reject / expire
            </text>
            <text x="737" y="698">
              changed
            </text>
            <text x="585" y="782">
              unchanged
            </text>
            <text x="180" y="828">
              local read permission
            </text>
          </g>
          {nodes.map(([x, y, title, detail, tone]) => (
            <g key={title} transform={`translate(${x} ${y})`}>
              <rect
                width="300"
                height="80"
                rx="12"
                fill={
                  tone === "deny"
                    ? "#522b2b"
                    : tone === "wait"
                      ? "#584923"
                      : "#172b21"
                }
              />
              <text x="16" y="30" fill="#ffffff" fontSize="17" fontWeight="700">
                {title}
              </text>
              <text x="16" y="57" fill="#e5eae1" fontSize="14">
                {detail}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <p>
        Approval is not proof of execution. The host reports the eventual
        outcome. In LIVE mode, an invalid or unavailable required review denies
        the request; it does not silently fall back to rules-only mode.
      </p>
    </figure>
  );
}
