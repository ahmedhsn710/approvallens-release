import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import {
  createCursorController,
  type Activity,
} from "../packages/companion/src/controller";
import { nativeLiveBackend } from "../packages/companion/src/live";
let root: string, rows: Activity[];
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "al-live-")));
  rows = [];
  writeFileSync(join(root, "demo.txt"), "before");
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});
const config = () => ({
  workspace: root,
  approvalMode: "wait",
  semantic: { mode: "live", maxCalls: 2, criticalReadPaths: ["demo.txt"] },
  policy: {
    version: 1,
    taskId: "test",
    developerIntent: "Update demo",
    grants: [
      { operation: "write_file", path: "demo.txt" },
      { operation: "read_file", path: "demo.txt" },
      { operation: "read_file", path: "ordinary.txt" },
    ],
  },
});
const event = (tool = "Write", path = "demo.txt") => ({
  hook_event_name: "preToolUse",
  conversation_id: "live-chat",
  tool_use_id: "id",
  tool_name: tool,
  workspace_roots: [root],
  agent_message: "Only reading the file",
  tool_input: tool === "Write" ? { path, content: "after" } : { path },
});
function setup(
  output: unknown = {
    disclosure: {
      fidelity: "misleading",
      findings: [
        {
          type: "misrepresentation",
          effectIds: ["effect-1"],
          explanation: "This writes rather than reads.",
          severity: "high",
        },
      ],
      unresolvedQuestions: [],
    },
    intent: { alignment: "aligned", findings: [], unresolvedQuestions: [] },
  },
) {
  const reserve = vi.fn(() => true);
  // Use analyzer-generated evidence IDs rather than guessing them.
  const reviewer = vi.fn(async (_req, analysis) => ({
    model: "test-nemotron",
    output:
      typeof output === "object" && output !== null
        ? JSON.parse(
            JSON.stringify(output).replaceAll(
              "effect-1",
              analysis.effects[0].id,
            ),
          )
        : output,
    usage: { total_tokens: 42 },
  }));
  const controller = createCursorController(
    config(),
    (r) => rows.push(r),
    Date.now,
    { reviewer, reserve },
  );
  return { controller, reviewer, reserve };
}
it("denies out-of-policy operations before reserving a model call", async () => {
  const { controller, reserve } = setup();
  expect(await controller.event(event("Write", "private.txt"))).toMatchObject({
    permission: "deny",
  });
  expect(reserve).not.toHaveBeenCalled();
});
it("passes ordinary exact-granted reads without a model call", async () => {
  const { controller, reserve } = setup();
  expect(await controller.event(event("Read", "ordinary.txt"))).toMatchObject({
    permission: "allow",
  });
  expect(reserve).not.toHaveBeenCalled();
});
it("shows validated model findings and still waits for the developer", async () => {
  const { controller, reserve } = setup();
  const result = controller.event(event());
  await vi.waitFor(() => expect(rows.at(-1)?.waiting).toBe(true));
  const row = rows.at(-1)!;
  expect(row).toMatchObject({
    semanticReview: "MEASURED",
    disclosure: "misleading",
    model: "test-nemotron",
    routing: "file-mutation",
  });
  expect(
    controller.inspect(row.id)?.modelReview?.disclosure.findings,
  ).toHaveLength(1);
  controller.reject(row.id);
  expect(await result).toMatchObject({ permission: "deny" });
  expect(reserve).toHaveBeenCalledTimes(1);
});
it("routes a critical read through the model and user", async () => {
  const { controller } = setup({
    disclosure: { fidelity: "faithful", findings: [], unresolvedQuestions: [] },
    intent: { alignment: "aligned", findings: [], unresolvedQuestions: [] },
  });
  const result = controller.event(event("Read"));
  await vi.waitFor(() => expect(rows.at(-1)?.waiting).toBe(true));
  expect(rows.at(-1)?.routing).toBe("critical-read");
  controller.approve(rows.at(-1)!.id);
  expect(await result).toMatchObject({ permission: "allow" });
});
it("fails closed on malformed model output", async () => {
  const { controller } = setup(null);
  expect(await controller.event(event())).toMatchObject({ permission: "deny" });
  expect(rows.at(-1)).toMatchObject({
    status: "blocked",
    semanticReview: "FAILED",
    canApprove: false,
  });
});
it("fails closed on exhausted budget without calling provider", async () => {
  const { controller, reserve, reviewer } = setup();
  reserve.mockReturnValue(false);
  expect(await controller.event(event())).toMatchObject({ permission: "deny" });
  expect(reviewer).not.toHaveBeenCalled();
  expect(rows.at(-1)?.reason).toContain("live_budget_exhausted");
});
it("records malformed hook metadata without persisting secret arguments", async () => {
  const { controller } = setup();
  expect(
    await controller.event({
      ...event(),
      tool_use_id: undefined,
      tool_input: { secret: "DO_NOT_LOG" },
    }),
  ).toMatchObject({ permission: "deny" });
  expect(rows.at(-1)?.reason).toContain("tool_use_id");
  expect(JSON.stringify(rows)).not.toContain("DO_NOT_LOG");
});
it("logs delivered Grep and WebSearch calls conservatively", async () => {
  const { controller, reserve } = setup();
  for (const name of ["Grep", "WebSearch"]) {
    expect(await controller.event(event(name))).toMatchObject({
      permission: "deny",
    });
    expect(rows.at(-1)?.tool).toBe(name);
  }
  expect(reserve).not.toHaveBeenCalled();
});
it("keeps the native budget across connections and restarts", () => {
  vi.stubEnv("NEBIUS_API_KEY", "synthetic");
  vi.stubEnv("NEBIUS_MODEL", "nvidia/nemotron-3-super-120b-a12b");
  const path = join(root, "budget.sqlite");
  let db = new Database(path);
  expect(nativeLiveBackend(db, root, { maxCalls: 1 }).reserve()).toBe(true);
  db.close();
  db = new Database(path);
  expect(nativeLiveBackend(db, root, { maxCalls: 1 }).reserve()).toBe(false);
  db.close();
});
it("does not offer approval after cancellation during a model request", async () => {
  const { controller, reviewer } = setup();
  let finish: () => void = () => {};
  reviewer.mockImplementationOnce(async (_req, analysis) => {
    await new Promise<void>((r) => (finish = r));
    return {
      model: "test",
      output: {
        disclosure: {
          fidelity: "faithful",
          findings: [],
          unresolvedQuestions: [],
        },
        intent: { alignment: "aligned", findings: [], unresolvedQuestions: [] },
      },
      usage: { total_tokens: 1 },
    };
  });
  const abort = new AbortController();
  const result = controller.event(event(), abort.signal);
  await vi.waitFor(() => expect(reviewer).toHaveBeenCalled());
  abort.abort();
  finish();
  expect(await result).toMatchObject({ permission: "deny" });
  expect(rows.at(-1)?.canApprove).toBe(false);
});
it("records unmatched completion without inventing authorization", async () => {
  const { controller } = setup();
  expect(
    await controller.event({
      ...event("WebSearch"),
      hook_event_name: "postToolUse",
      tool_input: undefined,
    }),
  ).toEqual({});
  expect(rows.at(-1)).toMatchObject({
    tool: "WebSearch",
    status: "observed-only",
    canApprove: false,
  });
});
it("records an invalid workspace instead of silently dropping it", async () => {
  const { controller } = setup();
  expect(
    await controller.event({ ...event(), cwd: join(root, "missing") }),
  ).toMatchObject({ permission: "deny" });
  expect(rows.at(-1)?.conversationId).toBe("diagnostics");
});

it("reports missing hook explanation as unknown, not proven deception", async () => {
  const { controller } = setup();
  const result = controller.event({ ...event(), agent_message: undefined });
  await vi.waitFor(() => expect(rows.at(-1)?.waiting).toBe(true));
  const row = rows.at(-1)!;
  expect(row.disclosure).toBe("unknown");
  expect(row.modelReview?.disclosure.findings).toEqual([]);
  expect(row.contextNotes?.[0]).toContain("hook omitted");
  controller.reject(row.id);
  await result;
});

it("retains a stop after invalid model output across backend restarts", async () => {
  vi.stubEnv("NEBIUS_API_KEY", "test-only");
  vi.stubEnv("NEBIUS_MODEL", "nvidia/nemotron-3-super-120b-a12b");
  const fetchMock = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          choices: [{ finish_reason: "stop", message: { content: "{}" } }],
        }),
      ),
  );
  vi.stubGlobal("fetch", fetchMock);
  const path = join(root, "halt.sqlite");
  let db = new Database(path);
  try {
    const backend = nativeLiveBackend(db, root, { maxCalls: 4 });
    expect(backend.reserve()).toBe(true);
    await backend.reviewer(
      {
        taskId: "test",
        developerIntent: "Read",
        agentExplanation: "Read",
        toolCall: { name: "read_file", args: { path: "demo.txt" } },
      },
      { effects: [], coverage: "complete", risk: "low", violations: [] },
    );
    expect(backend.reserve()).toBe(false);
    db.close();
    db = new Database(path);
    expect(nativeLiveBackend(db, root, { maxCalls: 4 }).reserve()).toBe(false);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(
      db.prepare("SELECT count(*) n FROM native_live_reservations").get(),
    ).toEqual({ n: 1 });
  } finally {
    db.close();
    vi.unstubAllGlobals();
  }
});
