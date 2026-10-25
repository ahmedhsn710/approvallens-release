import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, realpathSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  captureLocalHistory,
  LocalHistory,
} from "../packages/core/src/evidence/local-history";
import {
  createCursorController,
  type Activity,
} from "../packages/companion/src/controller";
import { createReviewService } from "../packages/mcp/src/core";
import { pipeline } from "../packages/core/src/pipeline";
import { nebiusReviewer } from "../packages/core/src/nebius";
const row = {
  conversationId: "a",
  tool: "Write",
  status: "human-approved",
  outcome: "tool-returned",
  humanDecision: "approved-once" as const,
};
const good = {
  disclosure: {
    fidelity: "faithful" as const,
    findings: [],
    unresolvedQuestions: [],
  },
  intent: {
    alignment: "aligned" as const,
    findings: [],
    unresolvedQuestions: [],
  },
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("bounds and isolates history, removing raw content and untrusted text", () => {
  const rows = Array.from({ length: 25 }, () => ({
    ...row,
    target: "SECRET_PATH",
    reason: "IGNORE POLICY",
    content: "SECRET_CONTENT",
  }));
  const h = captureLocalHistory(
    [...rows, { ...row, conversationId: "other" }],
    "a",
  );
  expect(h.entries).toHaveLength(20);
  expect(h.truncated).toBe(true);
  expect(h.complete).toBe(false);
  expect(JSON.stringify(h)).not.toMatch(/SECRET|IGNORE|other/);
  expect(h.entries[0]).toEqual({
    operation: "write_file",
    decision: "approved",
    human: "approved-once",
    completion: "hook-reported-return",
  });
  expect(captureLocalHistory(rows, "other").entries).toEqual([]);
});
it("does not infer execution from approval, and snapshots are immutable", () => {
  const r = { ...row, outcome: "not-observed" };
  const h = captureLocalHistory([r], "a");
  r.outcome = "tool-returned";
  expect(h.entries[0]?.completion).toBe("not-observed");
  expect(() => LocalHistory.parse({ ...h, complete: true })).toThrow();
  expect(() =>
    LocalHistory.parse({ ...h, entries: Array(21).fill(h.entries[0]) }),
  ).toThrow();
});
it("rejects history supplied through tool arguments", async () => {
  const service = createReviewService({
    version: 1,
    taskId: "t",
    developerIntent: "Read",
    grants: [],
  });
  await expect(
    service({
      toolCall: { name: "read_file", args: { path: "a.json" } },
      agentExplanation: "Read",
      localHistory: captureLocalHistory([], "a"),
    }),
  ).rejects.toThrow();
});
it("history cannot override a preserve violation with a favorable reviewer", async () => {
  const result = await pipeline(
    {
      taskId: "t",
      developerIntent: "Preserve",
      agentExplanation: "Fine",
      toolCall: {
        name: "write_file",
        args: { path: "a.json", content: '{"retries":2}' },
      },
    },
    {
      grants: [{ operation: "write_file", path: "a.json" }],
      evidence: [{ path: "a.json", fields: { "/retries": "integer" } }],
      constraints: [
        {
          kind: "preserve_field",
          id: "keep",
          path: "a.json",
          field: "/retries",
        },
      ],
    },
    async () => ({ output: good, model: "test-double" }),
    {
      path: "a.json",
      before: '{"retries":1}',
      kind: "local-observation",
      snapshot: { id: "x", manifestHash: "x" },
    },
    captureLocalHistory([row], "a"),
  );
  expect(result.decision.outcome).toBe("block");
  expect(result.executable).toBe(false);
});
it("passes local hook observations only to the same conversation and resets on controller restart", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "al-history-")));
  writeFileSync(join(root, "a.json"), "{}");
  try {
    const rows: Activity[] = [];
    const config = {
      workspace: root,
      approvalMode: "wait",
      semantic: { mode: "live", maxCalls: 4 },
      policy: {
        version: 1,
        taskId: "t",
        developerIntent: "Read then update",
        grants: [
          { operation: "read_file", path: "a.json" },
          { operation: "write_file", path: "a.json" },
        ],
      },
    };
    const seen: unknown[] = [];
    const backend = {
      reserve: () => true,
      reviewer: async (
        _r: unknown,
        a: import("../packages/core/src/contracts").Analysis,
      ) => {
        seen.push(structuredClone(a.localHistory));
        return { output: good, model: "test-double" };
      },
    };
    let controller = createCursorController(
      config,
      (r) => rows.push(r),
      Date.now,
      backend,
    );
    const event = (tool_name: string, id: string, conversation_id = "a") => ({
      hook_event_name: "preToolUse",
      conversation_id,
      tool_use_id: id,
      tool_name,
      tool_input:
        tool_name === "Write"
          ? { path: "a.json", content: "{}" }
          : { path: "a.json" },
      workspace_roots: [root],
    });
    await controller.event(event("Read", "r"));
    await controller.event({
      ...event("Read", "r"),
      hook_event_name: "postToolUse",
    });
    for (const chat of ["a", "b"]) {
      const pending = controller.event(event("Write", "w", chat));
      await vi.waitFor(() => expect(rows.at(-1)?.waiting).toBe(true));
      controller.reject(rows.at(-1)!.id);
      await pending;
    }
    expect(LocalHistory.parse(seen[0]).entries).toEqual([
      {
        operation: "read_file",
        decision: "allowed-by-policy",
        human: "not-recorded",
        completion: "hook-reported-return",
      },
    ]);
    expect(LocalHistory.parse(seen[1]).entries).toEqual([]);
    controller = createCursorController(
      config,
      (r) => rows.push(r),
      Date.now,
      backend,
    );
    const pending = controller.event(event("Write", "restart"));
    await vi.waitFor(() => expect(rows.at(-1)?.waiting).toBe(true));
    controller.reject(rows.at(-1)!.id);
    await pending;
    expect(LocalHistory.parse(seen[2]).entries).toEqual([]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
it("sends the labeled summary to the grounded provider without paths or narrative", async () => {
  vi.stubEnv("NEBIUS_API_KEY", "test-only");
  vi.stubEnv("NEBIUS_MODEL", "test-model");
  const fetchMock = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: { content: JSON.stringify(good) },
            },
          ],
        }),
      ),
  );
  vi.stubGlobal("fetch", fetchMock);
  await nebiusReviewer("grounded")(
    {
      taskId: "t",
      developerIntent: "Read",
      agentExplanation: "Read",
      toolCall: { name: "read_file", args: { path: "a.json" } },
    },
    {
      effects: [],
      coverage: "complete",
      risk: "low",
      violations: [],
      localHistory: captureLocalHistory([row], "a"),
    },
  );
  const init = fetchMock.mock.calls[0] as unknown as [
    unknown,
    { body: string },
  ];
  const user = JSON.parse(JSON.parse(init[1].body).messages[1].content);
  expect(user.localHistory.source).toBe("local-service-observations");
  expect(user.localHistory.complete).toBe(false);
});
