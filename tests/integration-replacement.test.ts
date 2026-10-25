import { expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { createReviewService } from "../packages/mcp/src/core";
import { reconstructJsonReplacement } from "../packages/mcp/src/json-replacement";
const before = '{"strict":false,"retries":1}';
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const baseline = {
  path: "settings.json",
  before,
  kind: "local-observation" as const,
  snapshot: { id: "test", manifestHash: "test" },
};
const policy = {
  version: 1 as const,
  taskId: "t",
  developerIntent: "Enable strict",
  grants: [{ operation: "write_file" as const, path: "settings.json" }],
  evidence: [
    {
      path: "settings.json",
      fields: { "/strict": "boolean" as const, "/retries": "integer" as const },
    },
  ],
  constraints: [
    {
      id: "keep",
      kind: "preserve_field" as const,
      path: "settings.json",
      field: "/retries",
    },
  ],
};
const action = (oldText = "false", newText = "true") => ({
  name: "replace_json_text" as const,
  args: {
    path: "settings.json",
    baselineSha256: sha(before),
    oldText,
    newText,
  },
});
it("reconstructed and whole-file writes use identical pipeline evidence and decision", async () => {
  const service = createReviewService(policy, undefined, () => baseline);
  const partial = await service({
    toolCall: action(),
    agentExplanation: "Enable strict",
  });
  const whole = await service({
    toolCall: {
      name: "write_file",
      args: { path: "settings.json", content: before.replace("false", "true") },
    },
    agentExplanation: "Enable strict",
  });
  expect(partial.analysis).toEqual(whole.analysis);
  expect(partial.decision).toEqual(whole.decision);
  expect(partial.identity).toEqual(whole.identity);
  expect(partial.approval.state).toBe("advisory-only");
  expect(partial.executable).toBe(false);
});
it("preserve violations block without reserving a model call", async () => {
  const reserve = vi.fn(() => true),
    reviewer = vi.fn();
  const result = await createReviewService(
    policy,
    { reserve, reviewer },
    () => baseline,
  )({ toolCall: action("1", "2"), agentExplanation: "Fine" });
  expect(result.decision.outcome).toBe("block");
  expect(result.nativePrerequisites.eligible).toBe(false);
  expect(reserve).not.toHaveBeenCalled();
});
it("refuses stale, missing, unlisted, forged and ambiguous baselines", async () => {
  const service = createReviewService(policy, undefined, () => baseline);
  await expect(
    service({
      toolCall: {
        ...action(),
        args: { ...action().args, baselineSha256: "0".repeat(64) },
      },
      agentExplanation: "Fine",
    }),
  ).rejects.toThrow("stale");
  await expect(
    createReviewService(policy)({
      toolCall: action(),
      agentExplanation: "Fine",
    }),
  ).rejects.toThrow("unavailable");
  await expect(
    createReviewService({ ...policy, evidence: [] })({
      toolCall: action(),
      agentExplanation: "Fine",
    }),
  ).rejects.toThrow("requires_json_policy");
  await expect(
    service({ toolCall: action(), agentExplanation: "Fine", before }),
  ).rejects.toThrow();
  expect(() =>
    reconstructJsonReplacement(
      {
        ...action("aa", "x"),
        args: { ...action("aa", "x").args, baselineSha256: sha("aaa") },
      },
      { ...baseline, before: "aaa" },
    ),
  ).toThrow("not_unique");
});
it("invalid reconstructed JSON stays incomplete; size excess is rejected", async () => {
  const r = await createReviewService(
    policy,
    undefined,
    () => baseline,
  )({ toolCall: action("false", "["), agentExplanation: "Fine" });
  expect(r.nativePrerequisites.eligible).toBe(false);
  expect(r.decision.outcome).not.toBe("allow");
  expect(() =>
    reconstructJsonReplacement(action("false", "x".repeat(16384)), baseline),
  ).toThrow("too_large");
});
it("accepts the explicit replacement schema through MCP while remaining advisory", async () => {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { InMemoryTransport } =
    await import("@modelcontextprotocol/sdk/inMemory.js");
  const { createIntegrationServer } =
    await import("../packages/mcp/src/server");
  const server = createIntegrationServer(policy, undefined, () => baseline),
    client = new Client({ name: "replacement-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  try {
    const r = await client.callTool({
      name: "approvallens_review",
      arguments: { toolCall: action(), agentExplanation: "Enable strict" },
    });
    expect(r.isError).toBeUndefined();
    expect(r.structuredContent).toMatchObject({
      actionRepresentation: "reconstructed-json-write",
      advisoryOnly: true,
      executable: false,
    });
    const stale = await client.callTool({
      name: "approvallens_review",
      arguments: {
        toolCall: {
          ...action(),
          args: { ...action().args, baselineSha256: "0".repeat(64) },
        },
        agentExplanation: "Enable strict",
      },
    });
    expect(stale.isError).toBe(true);
  } finally {
    await client.close();
    await server.close();
  }
});
