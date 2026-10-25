import { expect, it, vi } from "vitest";
import {
  createReviewService,
  type IntegrationPolicy,
} from "../packages/mcp/src/core";
import type { ToolCall } from "../packages/core/src/contracts";
const policy: IntegrationPolicy = {
  version: 1,
  taskId: "admission",
  developerIntent: "Enable strict, preserve retries",
  grants: [{ operation: "write_file", path: "settings.json" }],
  evidence: [
    {
      path: "settings.json",
      fields: { "/strict": "boolean", "/retries": "integer" },
    },
  ],
  constraints: [
    {
      id: "keep",
      kind: "preserve_field",
      path: "settings.json",
      field: "/retries",
    },
  ],
};
const baseline = {
  path: "settings.json",
  before: '{"strict":false,"retries":1}',
  kind: "local-observation" as const,
  snapshot: { id: "test", manifestHash: "test" },
};
const valid = {
  model: "test-double",
  output: {
    disclosure: { fidelity: "faithful", findings: [], unresolvedQuestions: [] },
    intent: { alignment: "aligned", findings: [], unresolvedQuestions: [] },
  },
};
it.each([
  [
    "ungranted",
    { name: "delete_file", args: { path: "other.json" } },
    false,
    "block",
  ],
  [
    "preserve violation",
    {
      name: "write_file",
      args: { path: "settings.json", content: '{"strict":true,"retries":2}' },
    },
    false,
    "block",
  ],
  [
    "missing baseline",
    {
      name: "write_file",
      args: { path: "settings.json", content: '{"strict":true,"retries":1}' },
    },
    true,
    "review",
  ],
  [
    "undisclosed change",
    {
      name: "write_file",
      args: {
        path: "settings.json",
        content: '{"strict":true,"retries":1,"secret":true}',
      },
    },
    false,
    "review",
  ],
  ["shell", { name: "shell", args: { command: "echo test" } }, false, "review"],
] as const)(
  "does not spend a call for %s",
  async (_name, call, missing, outcome) => {
    const reserve = vi.fn(() => true),
      reviewer = vi.fn(async () => valid);
    const service = createReviewService(policy, { reserve, reviewer }, () =>
      missing ? undefined : baseline,
    );
    const result = await service({
      toolCall: call as ToolCall,
      agentExplanation: "This is fine",
    });
    expect(result).toMatchObject({
      mode: "LIVE",
      semanticReview: "NOT_MEASURED",
      executable: false,
      decision: { outcome },
      error: null,
    });
    expect(result.semanticSkipReason).toBeTruthy();
    expect(reserve).not.toHaveBeenCalled();
    expect(reviewer).not.toHaveBeenCalled();
  },
);
it("reviews a complete permitted change using one baseline observation", async () => {
  const evidence = vi.fn(() => baseline),
    reserve = vi.fn(() => true),
    reviewer = vi.fn(async () => valid);
  const service = createReviewService(policy, { reserve, reviewer }, evidence);
  const result = await service({
    toolCall: {
      name: "write_file",
      args: { path: "settings.json", content: '{"strict":true,"retries":1}' },
    },
    agentExplanation: "Enable strict",
  });
  expect(result).toMatchObject({
    semanticReview: "MEASURED",
    semanticSkipReason: null,
    executable: false,
  });
  expect(evidence).toHaveBeenCalledOnce();
  expect(reserve).toHaveBeenCalledOnce();
  expect(reviewer).toHaveBeenCalledOnce();
});
