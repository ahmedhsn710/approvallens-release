import { mkdtempSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createEvidenceProvider } from "../packages/mcp/src/evidence";
import { createReviewService } from "../packages/mcp/src/core";
import {
  createCursorController,
  type Activity,
} from "../packages/companion/src/controller";
import { review } from "./helpers";
const roots: string[] = [];
afterEach(() =>
  roots
    .splice(0)
    .forEach((root) => rmSync(root, { recursive: true, force: true })),
);
function setup() {
  const root = mkdtempSync(join(tmpdir(), "lens-evidence-"));
  roots.push(root);
  writeFileSync(join(root, "config.json"), '{"strict":false,"retries":1}');
  const files = [
    {
      path: "config.json",
      fields: { "/strict": "boolean" as const, "/retries": "integer" as const },
    },
  ];
  const policy = {
    version: 1 as const,
    evidence: files,
    taskId: "test",
    developerIntent: "Enable strict mode",
    grants: [{ operation: "write_file" as const, path: "config.json" }],
    constraints: [
      {
        id: "retries",
        kind: "preserve_field" as const,
        path: "config.json",
        field: "retries",
      },
    ],
  };
  return { root, files, policy };
}
it("uses local baseline, rejects agent context and blocks a restriction despite favorable review", async () => {
  const { root, files, policy } = setup();
  const service = createReviewService(
    policy,
    {
      reserve: () => true,
      reviewer: async () => ({ output: review(), model: "double" }),
    },
    createEvidenceProvider(root),
  );
  const args = {
    toolCall: {
      name: "write_file",
      args: { path: "config.json", content: '{"strict":true,"retries":99}' },
    },
    agentExplanation: "Enable strict mode",
  };
  const result = await service(args);
  expect(result.assessment).toMatchObject({
    executionAuthorized: false,
    preservation: { violated: [{ id: "retries" }] },
  });
  expect(result.decision.outcome).toBe("block");
  expect(result.analysis.effects[0]!.content?.changes).toHaveLength(2);
  await expect(service({ ...args, before: "{}" })).rejects.toThrow();
});
it("does not read unlisted files and refuses symlink evidence", () => {
  const { root, files } = setup();
  const evidence = createEvidenceProvider(root);
  expect(
    evidence(
      { name: "write_file", args: { path: "other.json", content: "{}" } },
      files[0]!,
    ),
  ).toBeUndefined();
  rmSync(join(root, "config.json"));
  symlinkSync("/etc/passwd", join(root, "config.json"));
  expect(() =>
    evidence(
      { name: "write_file", args: { path: "config.json", content: "{}" } },
      files[0]!,
    ),
  ).toThrow();
});
it("native LIVE passes evidence, fails closed on exhausted budget, and never auto-allows a write", async () => {
  const { root, files, policy } = setup();
  const rows: Activity[] = [];
  const reviewer = vi.fn(async () => ({ output: review(), model: "double" }));
  let available = true;
  const controller = createCursorController(
    { workspace: root, policy, semantic: { mode: "live", maxCalls: 2 } },
    (row) => rows.push(row),
    Date.now,
    { reserve: () => available, reviewer },
  );
  const event = {
    hook_event_name: "preToolUse",
    conversation_id: "c",
    tool_use_id: "one",
    tool_name: "Write",
    workspace_roots: [root],
    tool_input: { path: "config.json", content: '{"strict":true,"retries":1}' },
    agent_message: "Enable strict mode",
  };
  expect(await controller.event(event)).toMatchObject({ permission: "deny" });
  expect(rows.at(-1)).toMatchObject({
    canApprove: true,
    disclosure: "faithful",
    intent: "aligned",
  });
  expect(reviewer.mock.calls.length).toBe(1);
  available = false;
  expect(
    await controller.event({ ...event, tool_use_id: "two" }),
  ).toMatchObject({ permission: "deny" });
  expect(rows.at(-1)?.canApprove).toBe(false);
});

it("native unsupported shell never spends a semantic call allowance", async () => {
  const { root, policy } = setup();
  const rows: Activity[] = [];
  const reserve = vi.fn(() => true);
  const reviewer = vi.fn(async () => ({ output: review(), model: "double" }));
  const controller = createCursorController(
    { workspace: root, policy, semantic: { mode: "live", maxCalls: 2 } },
    (r) => rows.push(r),
    Date.now,
    { reserve, reviewer },
  );
  expect(
    await controller.event({
      hook_event_name: "preToolUse",
      conversation_id: "c",
      tool_use_id: "shell",
      tool_name: "Shell",
      workspace_roots: [root],
      tool_input: { command: "echo fixture" },
    }),
  ).toMatchObject({ permission: "deny" });
  expect(reserve).not.toHaveBeenCalled();
  expect(reviewer).not.toHaveBeenCalled();
  expect(rows.at(-1)?.assessment?.permission).toBe("unassessed");
});
