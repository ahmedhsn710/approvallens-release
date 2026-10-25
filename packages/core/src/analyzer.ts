import type { Analysis, Request } from "./contracts";
import {
  isNormalizedRelativePath,
  matchGrant,
  parseScope,
  type Scope,
} from "./scope";
import { type JsonEvidenceContext } from "./evidence/json-changes";
import { inspectMutation } from "./evidence/analyzers";

/** v6 makes stored policy select bounded JSON evidence for every file mutation. */
export const ANALYZER_VERSION = "evidence-analyzers-v7";

const SENSITIVE_PATH =
  /(^|\/)(\.env(?:\.[^/]*)?|\.ssh|credentials(?:\.[^/]*)?)(\/|$)/i;

// No filesystem access here: verified baseline bytes must come from the trusted caller.
// Operation evidence remains lexical; optional field evidence does not prove runtime behavior.
export function analyze(
  request: Request,
  scope: Scope,
  contentContext?: JsonEvidenceContext,
): Analysis {
  scope = parseScope(scope);
  const tool = request.toolCall;

  if (tool.name === "shell") {
    // No shell grant exists, and the command is not parsed: coverage stays unknown.
    return {
      effects: [
        {
          id: "e1",
          kind: "unknown",
          resource: "shell",
          evidence:
            "toolCall.args.command: opaque command, not parsed or executed",
          certainty: "unknown",
        },
      ],
      coverage: "unknown",
      risk: "high",
      violations: [],
    };
  }

  if (tool.name === "run_fixture_task") {
    // The task id is a closed enum in the contract, so there is no command text to inspect or smuggle.
    const grant = matchGrant(scope, "run_fixture_task", tool.args.task);
    return {
      effects: [
        {
          id: "e1",
          kind: "fixture_task",
          resource: tool.args.task,
          evidence:
            "toolCall.args.task (fixed fixture task id; no command, arguments or environment are accepted)",
          certainty: "direct",
        },
      ],
      coverage: "complete",
      risk: "low",
      violations: [
        ...(grant === "path_not_granted"
          ? ["Fixture task outside trusted task scope"]
          : []),
        ...(grant === "operation_not_granted"
          ? ["Operation not granted for this path"]
          : []),
      ],
    };
  }

  const p = tool.args.path;
  const invalid = !isNormalizedRelativePath(p);
  const sensitive = SENSITIVE_PATH.test(p);
  const grant = matchGrant(scope, tool.name, p);
  const violations = [
    ...(invalid ? ["Invalid workspace-relative path"] : []),
    ...(grant === "path_not_granted"
      ? ["Path outside trusted task scope"]
      : []),
    ...(grant === "operation_not_granted"
      ? ["Operation not granted for this path"]
      : []),
    ...(sensitive ? ["Sensitive path forbidden"] : []),
  ];
  const kind =
    tool.name === "read_file"
      ? "file_read"
      : tool.name === "write_file"
        ? "file_write"
        : "file_delete";

  const inspection =
    tool.name === "write_file" || tool.name === "delete_file"
      ? inspectMutation(tool, scope, contentContext)
      : undefined;
  const { baselineAvailable: _baseline, ...contentFields } = inspection ?? {};
  return {
    effects: [
      {
        id: "e1",
        kind,
        resource: p,
        evidence: inspection?.content
          ? "toolCall.args.path and policy-required JSON comparison"
          : "toolCall.args.path (operation and path only; contents were not inspected)",
        certainty: "direct",
        ...contentFields,
      },
    ],
    coverage:
      invalid || (inspection?.content && !inspection.baselineAvailable)
        ? "unknown"
        : "complete",
    risk: sensitive || tool.name === "delete_file" ? "high" : "low",
    violations,
  };
}
