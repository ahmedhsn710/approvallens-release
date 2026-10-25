import type { Analysis, Review } from "../contracts";

/** Orthogonal facts, not a confidence score. Derived from evidence, never accepted from a model. */
export function assessDecision(analysis: Analysis, review: Review | null) {
  const checks = analysis.effects.flatMap(
    (effect) => effect.constraintChecks ?? [],
  );
  return {
    permission: analysis.violations.length
      ? ("denied" as const)
      : analysis.coverage === "unknown"
        ? ("unassessed" as const)
        : ("permitted" as const),
    evidence: {
      operationCoverage: analysis.coverage,
      content: analysis.effects.map((effect) => ({
        effectId: effect.id,
        status: effect.content?.status ?? "not-inspected",
        basis:
          effect.inspection?.basis ??
          (effect.content
            ? "json-comparison"
            : effect.kind === "unknown"
              ? "opaque"
              : "declared-operation"),
        limitations: effect.inspection?.limitations ??
          effect.content?.limitations ?? ["contents_not_inspected"],
      })),
      incomplete:
        analysis.coverage === "unknown" ||
        analysis.effects.some(
          (effect) =>
            effect.content?.status === "incomplete" ||
            effect.inspection?.status === "incomplete",
        ),
    },
    preservation: {
      violated: checks.filter((check) => check.status === "violated"),
      unassessed: checks.filter((check) => check.status === "unknown"),
    },
    judgment: {
      available: review !== null,
      disclosure: review?.disclosure.fidelity ?? "unavailable",
      intent: review?.intent.alignment ?? "unavailable",
    },
    risk: analysis.risk,
    executionAuthorized: false as const,
  };
}
export type DecisionAssessment = ReturnType<typeof assessDecision>;
