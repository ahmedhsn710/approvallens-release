import type { Analysis, Review } from "../../core/src/contracts";
import type { Decision } from "../../core/src/pipeline";

/** Native approval prerequisites, not an authorization or replacement for pipeline policy.
 * Validated uncertain semantic findings remain reviewable by a person, as before.
 * Web fixture execution has stricter semantic and handler requirements.
 */
export function nativeApprovalPrerequisites(input: {
  analysis: Analysis;
  decision: Decision;
  review: Review | null;
  semanticRequired: boolean;
  semanticMeasured: boolean;
}) {
  const reasons: string[] = [];
  if (
    input.decision.outcome === "block" ||
    input.decision.scope.status === "denied"
  )
    reasons.push("policy_blocked");
  if (
    input.analysis.coverage !== "complete" ||
    input.decision.scope.status === "unassessed"
  )
    reasons.push("coverage_unknown");
  if (
    input.analysis.effects.some(
      (e) =>
        e.content?.status === "incomplete" ||
        e.inspection?.status === "incomplete",
    )
  )
    reasons.push("content_incomplete");
  if (
    input.analysis.effects.some((e) =>
      e.constraintChecks?.some((c) => c.status === "unknown"),
    )
  )
    reasons.push("preservation_unassessed");
  if (
    input.analysis.effects.some((e) =>
      e.constraintChecks?.some((c) => c.status === "violated"),
    )
  )
    reasons.push("preservation_violated");
  if (input.semanticRequired && (!input.semanticMeasured || !input.review))
    reasons.push("validated_review_required");
  return {
    eligible: reasons.length === 0,
    reasons,
    executionAuthorized: false as const,
  };
}
