import { LocalHistory } from "./evidence/local-history";
import {
  REVIEW_SCHEMA_VERSION,
  Request,
  validateReview,
  type Analysis,
  type Review,
} from "./contracts";
import { ANALYZER_VERSION, analyze } from "./analyzer";
import { SCOPE_VERSION, type Scope } from "./scope";
import type { JsonEvidenceContext } from "./evidence/json-changes";

/**
 * Increment when scope or decide() semantics change. v1 had a single string-reason
 * decision; v2.1 added `unassessed` scope; v2.2 moved to operation+path grants;
 * v2.3 adds run_fixture_task; v2.4 adds content coverage; v2.5 enforces explicit restrictions; v2.6 gates policy-required content coverage.
 */
export const POLICY_VERSION = "decision-v2.7";
import { assessDecision, type DecisionAssessment } from "./decision/assessment";
export { assessDecision } from "./decision/assessment";

export type ReviewerResult = {
  output: unknown;
  usage?: unknown;
  model: string;
};
export type Reviewer = ((
  request: Request,
  analysis: Analysis,
) => Promise<ReviewerResult>) & {
  /** Declared by real reviewers so reports show the prompt even when a call fails. */
  promptVersion?: string;
};

export type ReasonSource =
  "policy" | "coverage" | "review" | "disclosure" | "intent" | "risk";
export type Reason = { source: ReasonSource; code: string; message: string };

/**
 * Deterministic scope authorization. Computed from the analysis alone and never
 * influenced by model output. `denied` is a hard denial that nothing can override.
 */
export type ScopeResult = {
  status: "permitted" | "denied" | "unassessed";
  violations: string[];
};

export type Decision = {
  outcome: "block" | "review" | "allow";
  scope: ScopeResult;
  reasons: Reason[];
};

export type ErrorCategory = "reviewer_failed" | "invalid_review";

export const versions = (promptVersion: string | null) => ({
  reviewSchema: REVIEW_SCHEMA_VERSION,
  prompt: promptVersion,
  analyzer: ANALYZER_VERSION,
  scope: SCOPE_VERSION,
  policy: POLICY_VERSION,
});

export function authorizeScope(analysis: Analysis): ScopeResult {
  return {
    status: analysis.violations.length
      ? "denied"
      : analysis.coverage === "unknown"
        ? "unassessed"
        : "permitted",
    violations: [...analysis.violations],
  };
}

/**
 * Precedence:
 * 1. Hard policy denial blocks, regardless of either semantic dimension.
 *    Explicit restriction violations also block; unassessed restrictions require non-executable review.
 * 2. Misleading disclosure of a high-risk operation blocks; this is a review
 *    block, not a scope denial, so scope.status stays `permitted`.
 * 3. Missing/unknown coverage, unknown or misleading disclosure, and unknown or
 *    misaligned intent require non-executable review.
 * 4. `allow` needs complete coverage, faithful disclosure, aligned intent and
 *    low risk. It is a recommendation; no result in this phase is executable.
 * The review is read-only here: it can add reasons but never changes scope or
 * rewrites either dimension of the review.
 */
export function decide(analysis: Analysis, review: Review | null): Decision {
  const scope = authorizeScope(analysis);
  if (scope.status === "denied") {
    return {
      outcome: "block",
      scope,
      reasons: scope.violations.map((message) => ({
        source: "policy",
        code: "scope_violation",
        message,
      })),
    };
  }

  const assessment = assessDecision(analysis, review);
  const violations = assessment.preservation.violated;
  if (violations.length) {
    return {
      outcome: "block",
      scope,
      reasons: violations.map((check) => ({
        source: "policy",
        code: "constraint_violation",
        message: `Restriction ${check.id}: field ${JSON.stringify(check.field)} must remain unchanged`,
      })),
    };
  }
  if (assessment.preservation.unassessed.length) {
    return {
      outcome: "review",
      scope,
      reasons: [
        {
          source: "coverage",
          code: "constraint_unassessed",
          message:
            "Explicit restrictions could not be checked against verified configuration contents",
        },
      ],
    };
  }

  if (
    analysis.effects.some(
      (effect) =>
        effect.content?.status === "incomplete" ||
        effect.inspection?.status === "incomplete",
    )
  ) {
    return {
      outcome: "review",
      scope,
      reasons: [
        {
          source: "coverage",
          code: "content_evidence_incomplete",
          message:
            "Policy-required contents could not be fully inspected; approval is unavailable",
        },
      ],
    };
  }

  if (!review) {
    return {
      outcome: "review",
      scope,
      reasons: [
        {
          source: "review",
          code: "review_unavailable",
          message: "No validated semantic review",
        },
      ],
    };
  }

  const reasons: Reason[] = [];
  if (analysis.coverage === "unknown") {
    reasons.push({
      source: "coverage",
      code: "coverage_unknown",
      message: "Analysis coverage is unknown",
    });
  }
  if (review.disclosure.fidelity === "misleading") {
    reasons.push({
      source: "disclosure",
      code: "disclosure_misleading",
      message: "Disclosure mismatch requires resolution",
    });
  } else if (review.disclosure.fidelity === "unknown") {
    reasons.push({
      source: "disclosure",
      code: "disclosure_unknown",
      message: "Disclosure could not be assessed",
    });
  }
  if (review.intent.alignment === "misaligned") {
    reasons.push({
      source: "intent",
      code: "intent_misaligned",
      message: "Operation does not match developer intent",
    });
  } else if (review.intent.alignment === "unknown") {
    reasons.push({
      source: "intent",
      code: "intent_unknown",
      message: "Intent alignment could not be assessed",
    });
  }

  if (review.disclosure.fidelity === "misleading" && analysis.risk === "high") {
    return { outcome: "block", scope, reasons };
  }
  if (reasons.length) return { outcome: "review", scope, reasons };
  if (analysis.risk === "high") {
    return {
      outcome: "review",
      scope,
      reasons: [
        {
          source: "risk",
          code: "high_risk",
          message: "High-risk operation requires human review",
        },
      ],
    };
  }
  return {
    outcome: "allow",
    scope,
    reasons: [
      {
        source: "policy",
        code: "analysis_only",
        message: "Analysis only; no execution authorization issued",
      },
    ],
  };
}

export type ReviewRun = {
  review: Review | null;
  error: string | null;
  errorCategory: ErrorCategory | null;
  model: string | null;
  usage: unknown;
  latencyMs: number;
};

/**
 * Call a reviewer and validate its output against the analysis. Never throws:
 * provider failures and invalid output are returned as categorized errors.
 */
export async function runReview(
  request: Request,
  analysis: Analysis,
  reviewer: Reviewer,
): Promise<ReviewRun> {
  const started = performance.now();
  const run: ReviewRun = {
    review: null,
    error: null,
    errorCategory: null,
    model: null,
    usage: null,
    latencyMs: 0,
  };

  let result: ReviewerResult | null = null;
  try {
    // Reviewer callbacks are observers, including injected test or future reviewers.
    result = await reviewer(
      structuredClone(request),
      structuredClone(analysis),
    );
  } catch {
    // Provider text is intentionally discarded: it may echo request content.
    run.error = "Reviewer call failed; execution unavailable";
    run.errorCategory = "reviewer_failed";
  }
  if (result) {
    run.model = result.model;
    run.usage = result.usage ?? null;
    try {
      run.review = validateReview(result.output, analysis);
    } catch {
      run.error = "Reviewer returned invalid output; execution unavailable";
      run.errorCategory = "invalid_review";
    }
  }
  run.latencyMs = Math.round(performance.now() - started);
  return run;
}

export async function pipeline(
  input: unknown,
  scope: Scope,
  reviewer?: Reviewer,
  contentContext?: JsonEvidenceContext,
  localHistory?: LocalHistory,
) {
  const request = Request.parse(input);
  const analysis = analyze(request, scope, contentContext);
  if (localHistory) analysis.localHistory = LocalHistory.parse(localHistory);
  const started = performance.now();
  const run = reviewer ? await runReview(request, analysis, reviewer) : null;
  const review = run?.review ?? null;

  return {
    request,
    analysis,
    review,
    decision: decide(analysis, review),
    assessment: assessDecision(analysis, review),
    mode: reviewer ? ("reviewer" as const) : ("rules-only" as const),
    model: run?.model ?? null,
    usage: run?.usage ?? null,
    error: run?.error ?? null,
    errorCategory: run?.errorCategory ?? null,
    versions: versions(reviewer?.promptVersion ?? null),
    latencyMs: Math.round(performance.now() - started),
    executable: false as const,
  };
}

// Optional in the storage-facing type so older reports and stage-based callers remain readable.
export type PipelineResult = Omit<
  Awaited<ReturnType<typeof pipeline>>,
  "assessment"
> & { assessment?: DecisionAssessment };
