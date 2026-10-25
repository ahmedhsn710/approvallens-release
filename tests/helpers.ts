import { Request } from "../packages/core/src/contracts";
import type { Reviewer } from "../packages/core/src/pipeline";

import type { Scope } from "../packages/core/src/scope";

export const scope: Scope = {
  grants: [{ operation: "read_file", path: "package.json" }],
};

export const readRequest = (
  path = "package.json",
  explanation = "Read package.json",
) =>
  Request.parse({
    taskId: "t",
    developerIntent: "Inspect dependencies in package.json",
    agentExplanation: explanation,
    toolCall: { name: "read_file", args: { path } },
  });

export const deleteRequest = (
  path = "obsolete.txt",
  explanation = "Delete obsolete.txt",
) =>
  Request.parse({
    taskId: "t",
    developerIntent: "Delete obsolete.txt",
    agentExplanation: explanation,
    toolCall: { name: "delete_file", args: { path } },
  });

export const shellRequest = Request.parse({
  taskId: "t",
  developerIntent: "Fix the build",
  agentExplanation: "Run this to fix the build.",
  toolCall: { name: "shell", args: { command: "npm install" } },
});

export const faithful = {
  fidelity: "faithful",
  findings: [],
  unresolvedQuestions: [],
} as const;
export const misleading = {
  fidelity: "misleading",
  findings: [
    {
      type: "misrepresentation",
      effectIds: ["e1"],
      explanation: "Different path",
      severity: "low",
    },
  ],
  unresolvedQuestions: [],
} as const;
export const omission = {
  fidelity: "misleading",
  findings: [
    {
      type: "omission",
      effectIds: ["e1"],
      explanation: "Write not mentioned",
      severity: "high",
    },
  ],
  unresolvedQuestions: [],
} as const;
export const disclosureUnknown = {
  fidelity: "unknown",
  findings: [],
  unresolvedQuestions: ["What does it do?"],
} as const;

export const aligned = {
  alignment: "aligned",
  findings: [],
  unresolvedQuestions: [],
} as const;
export const misaligned = {
  alignment: "misaligned",
  findings: [
    { effectIds: ["e1"], explanation: "Reads a different file than requested" },
  ],
  unresolvedQuestions: [],
} as const;
export const intentUnknown = {
  alignment: "unknown",
  findings: [],
  unresolvedQuestions: ["Is this related?"],
} as const;

// Parameters are deliberately loose so tests can build invalid reviews too.
export const review = (
  disclosure: unknown = faithful,
  intent: unknown = aligned,
) => ({ disclosure, intent });

/** Explicit test double for the reviewer; no network, no provider. */
export const double = (output: unknown): Reviewer =>
  Object.assign(async () => ({ output, model: "test-double" }), {
    promptVersion: "test-prompt",
  });
