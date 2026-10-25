import { z } from "zod";
import type { JsonChangeEvidence } from "./evidence/json-changes";
import type { ConstraintCheck } from "./evidence/constraints";
import type { Inspection } from "./evidence/analyzers";
import type { LocalHistory } from "./evidence/local-history";
import type { ExecutionHistory } from "./evidence/history";

/** Shared bounds used by the web form, API bodies and analysis contracts. */
export const PATH_MAX_CHARS = 1024;
export const WRITE_CONTENT_MAX_CHARS = 4096;
export const SHELL_COMMAND_MAX_CHARS = 4096;
export const EXPLANATION_MAX_CHARS = 2000;

const path = z.string().min(1).max(PATH_MAX_CHARS);

/**
 * Fixed, server-defined fixture tasks. `run_fixture_task` names one of these ids; it can never carry a
 * command line, arguments, environment or a path. The entry point behind each id is prebuilt into the
 * worker image, so adding a task requires changing the image and this list, not a request.
 */
export const FIXTURE_TASKS = ["acceptance-test"] as const;
export type FixtureTask = (typeof FIXTURE_TASKS)[number];

export const ToolCall = z.discriminatedUnion("name", [
  z.strictObject({
    name: z.literal("read_file"),
    args: z.strictObject({ path }),
  }),
  z.strictObject({
    name: z.literal("write_file"),
    args: z.strictObject({ path, content: z.string().max(16384) }),
  }),
  z.strictObject({
    name: z.literal("delete_file"),
    args: z.strictObject({ path }),
  }),
  z.strictObject({
    name: z.literal("run_fixture_task"),
    args: z.strictObject({ task: z.enum(FIXTURE_TASKS) }),
  }),
  z.strictObject({
    name: z.literal("shell"),
    args: z.strictObject({
      command: z.string().min(1).max(SHELL_COMMAND_MAX_CHARS),
    }),
  }),
]);

export type ToolCall = z.infer<typeof ToolCall>;

/** What the operation acts on: a path, a fixed task id, or (for opaque shell) the command text. */
export function toolTarget(call: ToolCall): string {
  switch (call.name) {
    case "shell":
      return call.args.command;
    case "run_fixture_task":
      return call.args.task;
    default:
      return call.args.path;
  }
}

export const Request = z.strictObject({
  taskId: z.string().min(1),
  developerIntent: z.string().min(1).max(4096),
  agentExplanation: z.string().min(1).max(4096),
  toolCall: ToolCall,
});
export type Request = z.infer<typeof Request>;

export type Effect = {
  id: string;
  kind: "file_read" | "file_write" | "file_delete" | "fixture_task" | "unknown";
  resource: string;
  evidence: string;
  certainty: "direct" | "unknown";
  /** Policy-required JSON comparison; source distinguishes web snapshots from local observations. */
  inspection?: Inspection;
  contentInspection?: "not-inspected" | "compared" | "unassessed";
  content?: JsonChangeEvidence;
  constraintChecks?: ConstraintCheck[];
};

export type Analysis = {
  history?: ExecutionHistory;
  localHistory?: LocalHistory;
  effects: Effect[];
  coverage: "complete" | "unknown";
  risk: "low" | "high";
  violations: string[];
};

/**
 * Version of the model-facing review contract below. The application stamps
 * this into reports; the model is never asked to echo it. Increment on any
 * change to field names, enums, bounds or validation semantics.
 * v1 was the unversioned single-dimension `Verification` contract in which
 * `intent_mismatch` could be reported as a disclosure finding.
 */
export const REVIEW_SCHEMA_VERSION = "approvallens.review.v2";

const EffectIds = z.array(z.string().min(1).max(64)).min(1).max(20);
const Question = z.string().min(1).max(2000);

/** Disclosure: does the agent explanation accurately describe the proposed operation? */
export const DisclosureFinding = z.strictObject({
  type: z.enum(["omission", "misrepresentation"]),
  effectIds: EffectIds,
  explanation: z.string().min(1).max(2000),
  severity: z.enum(["low", "medium", "high"]),
});

export const Disclosure = z.strictObject({
  fidelity: z.enum(["faithful", "misleading", "unknown"]),
  findings: z.array(DisclosureFinding).max(20),
  unresolvedQuestions: z.array(Question).max(20),
});

/** Intent: does the proposed operation serve the developer's stated goal? Independent of disclosure. */
export const IntentFinding = z.strictObject({
  effectIds: EffectIds,
  explanation: z.string().min(1).max(1000),
});

export const Intent = z.strictObject({
  alignment: z.enum(["aligned", "misaligned", "unknown"]),
  findings: z.array(IntentFinding).max(10),
  unresolvedQuestions: z.array(Question).max(10),
});

export const Review = z.strictObject({
  disclosure: Disclosure,
  intent: Intent,
});
export type Review = z.infer<typeof Review>;

function assertKnownEffects(
  ids: string[][],
  known: Set<string>,
  dimension: string,
): void {
  if (ids.some((group) => group.some((id) => !known.has(id)))) {
    throw new Error(`Invalid evidence reference in ${dimension}`);
  }
}

/**
 * Structural validation only. A passing result means the output matches the
 * schema, cites effect IDs that exist in the analysis, and is internally
 * consistent. It does NOT mean the semantic judgments are correct.
 */
export function validateReview(raw: unknown, analysis: Analysis): Review {
  const review = Review.parse(raw);
  const known = new Set(
    analysis.effects.flatMap((effect) => [
      effect.id,
      ...(effect.content?.changes.map((change) => change.id) ?? []),
    ]),
  );
  const { disclosure, intent } = review;

  assertKnownEffects(
    disclosure.findings.map((f) => f.effectIds),
    known,
    "disclosure",
  );
  assertKnownEffects(
    intent.findings.map((f) => f.effectIds),
    known,
    "intent",
  );

  if (
    disclosure.fidelity === "faithful" &&
    (disclosure.findings.length || disclosure.unresolvedQuestions.length)
  ) {
    throw new Error("Inconsistent faithful disclosure");
  }
  if (disclosure.fidelity === "misleading" && !disclosure.findings.length) {
    throw new Error("Misleading disclosure requires findings");
  }
  if (
    disclosure.fidelity === "unknown" &&
    (disclosure.findings.length || !disclosure.unresolvedQuestions.length)
  ) {
    throw new Error(
      "Unknown disclosure requires unresolved questions and no findings",
    );
  }

  if (
    intent.alignment === "aligned" &&
    (intent.findings.length || intent.unresolvedQuestions.length)
  ) {
    throw new Error("Inconsistent aligned intent");
  }
  if (intent.alignment === "misaligned" && !intent.findings.length) {
    throw new Error("Misaligned intent requires findings");
  }
  if (
    intent.alignment === "unknown" &&
    (intent.findings.length || !intent.unresolvedQuestions.length)
  ) {
    throw new Error(
      "Unknown intent requires unresolved questions and no findings",
    );
  }

  // Conservative coverage: when the analyzer could not fully describe the
  // operation, neither dimension may claim certainty.
  if (
    analysis.coverage === "unknown" &&
    (disclosure.fidelity !== "unknown" || intent.alignment !== "unknown")
  ) {
    throw new Error("Unsupported certainty under unknown coverage");
  }
  if (
    analysis.effects.some(
      (effect) =>
        effect.content?.status === "incomplete" ||
        effect.inspection?.status === "incomplete",
    ) &&
    (disclosure.fidelity !== "unknown" || intent.alignment !== "unknown")
  ) {
    throw new Error("Unsupported certainty under incomplete content evidence");
  }
  return review;
}
