import type { Request, Effect } from "../contracts";
import type { Scope, EvidenceEntry } from "../scope";
import {
  jsonChangeEvidence,
  JSON_EVIDENCE_VERSION,
  type JsonEvidenceContext,
} from "./json-changes";
import { checkConstraints } from "./constraints";

export type Inspection = {
  analyzer: string;
  version: string;
  basis: "declared-operation" | "json-comparison" | "opaque";
  status: "complete" | "incomplete" | "not-inspected";
  limitations: string[];
};
type Mutation = Extract<
  Request["toolCall"],
  { name: "write_file" | "delete_file" }
>;
type EvidenceInput = {
  action: Mutation;
  entry: EvidenceEntry;
  scope: Scope;
  baseline?: JsonEvidenceContext;
};
export type ContentAnalysis = Pick<
  Effect,
  "content" | "constraintChecks" | "contentInspection"
> & { inspection: Inspection; baselineAvailable: boolean };
/** Implemented in trusted application code, never selected or installed by tool arguments.
 * Future analyzers must report missing coverage explicitly and emit only policy-disclosed evidence.
 */
export interface ContentAnalyzer {
  readonly id: string;
  readonly version: string;
  analyze(input: EvidenceInput): ContentAnalysis;
}
const jsonAnalyzer: ContentAnalyzer = {
  id: "bounded-json",
  version: JSON_EVIDENCE_VERSION,
  analyze({ action, entry, scope, baseline }) {
    const before = baseline?.path === entry.path ? baseline : undefined;
    const after = action.name === "write_file" ? action.args.content : null;
    const content = jsonChangeEvidence(entry.path, after, before, entry.fields);
    const constraints =
      scope.constraints?.filter((rule) => rule.path === entry.path) ?? [];
    return {
      content,
      contentInspection:
        content.status === "complete" ? "compared" : "unassessed",
      ...(constraints.length
        ? {
            constraintChecks: checkConstraints(
              before?.before,
              after,
              constraints,
            ),
          }
        : {}),
      inspection: {
        analyzer: this.id,
        version: this.version,
        basis: "json-comparison",
        status: content.status,
        limitations: [...content.limitations, "runtime_behavior_not_verified"],
      },
      baselineAvailable: before?.before != null,
    };
  },
};

export function inspectMutation(
  action: Mutation,
  scope: Scope,
  baseline?: JsonEvidenceContext,
): ContentAnalysis {
  const entry = scope.evidence?.find(
    (entry) => entry.path === action.args.path,
  );
  if (entry) return jsonAnalyzer.analyze({ action, entry, scope, baseline });
  const constraints =
    scope.constraints?.filter((rule) => rule.path === action.args.path) ?? [];
  return {
    contentInspection: "not-inspected",
    baselineAvailable: false,
    ...(constraints.length
      ? {
          constraintChecks: checkConstraints(
            undefined,
            action.name === "write_file" ? action.args.content : null,
            constraints,
          ),
        }
      : {}),
    inspection: {
      analyzer: "operation-only",
      version: "operation-v1",
      basis: "declared-operation",
      status: "not-inspected",
      limitations: ["contents_not_inspected", "runtime_behavior_not_verified"],
    },
  };
}
