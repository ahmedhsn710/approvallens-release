import type { Decision, ErrorCategory } from "./pipeline";

/** Guidance only. Execution eligibility and human approval remain separate gates. */
export function nextStep(
  decision: Decision | null,
  error?: ErrorCategory | null,
): string {
  if (decision?.outcome === "block")
    return "Revise the proposal to resolve the blocked operation or restriction. This proposal cannot be approved.";
  if (error)
    return "Resolve the review failure, then explicitly retry analysis. A failed review is not approval.";
  if (!decision)
    return "Wait for analysis to finish before deciding what to do.";
  if (
    decision.reasons.some((reason) =>
      [
        "constraint_unassessed",
        "coverage_unknown",
        "content_evidence_incomplete",
      ].includes(reason.code),
    )
  ) {
    return "Supply supported, verifiable evidence or narrow the proposed action, then submit a new proposal.";
  }
  if (
    decision.reasons.some((reason) =>
      ["disclosure_misleading", "intent_misaligned"].includes(reason.code),
    )
  ) {
    return "Revise the action or its explanation to match the goal and actual changes, then submit a new proposal.";
  }
  if (decision.outcome === "review")
    return "Resolve the unanswered questions and review the execution requirements below. This recommendation does not authorize execution.";
  return "Inspect the evidence and execution requirements below. Running an eligible action still requires your explicit approval.";
}
