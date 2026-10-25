import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createCursorController,
  type Activity,
} from "../packages/companion/src/controller";
let root: string,
  rows: Activity[],
  controller: ReturnType<typeof createCursorController>;
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "al-wait-")));
  rows = [];
  writeFileSync(join(root, "demo.txt"), "before");
  controller = createCursorController(
    {
      workspace: root,
      approvalMode: "wait",
      policy: {
        version: 1,
        taskId: "wait",
        developerIntent: "Update fixture",
        grants: [{ operation: "write_file", path: "demo.txt" }],
      },
    },
    (row) => rows.push(row),
  );
});
afterEach(() => {
  vi.useRealTimers();
  rmSync(root, { recursive: true, force: true });
});
const event = (chat = "a") => ({
  hook_event_name: "preToolUse",
  conversation_id: chat,
  tool_use_id: "same-tool-id",
  tool_name: "Write",
  workspace_roots: [root],
  tool_input: { path: "demo.txt", content: "after" },
});
async function pending() {
  await vi.waitFor(() => expect(rows.some((r) => r.waiting)).toBe(true));
  return rows.find((r) => r.waiting)!;
}
it("holds original call until approval; no retry permit is issued", async () => {
  let finished = false;
  const result = controller.event(event()).then((r) => {
    finished = true;
    return r;
  });
  const row = await pending();
  expect(finished).toBe(false);
  expect(controller.approve(row.id)).toEqual({ ok: true });
  expect(await result).toMatchObject({ permission: "allow" });
  const abort = new AbortController();
  const second = controller.event(event(), abort.signal);
  await vi.waitFor(() => expect(rows.at(-1)?.waiting).toBe(true));
  abort.abort();
  expect(await second).toMatchObject({ permission: "deny" });
});
it("rejects the waiting call immediately", async () => {
  const result = controller.event(event());
  const row = await pending();
  controller.reject(row.id);
  expect(await result).toMatchObject({ permission: "deny" });
  expect(rows.at(-1)).toMatchObject({
    status: "rejected",
    canApprove: false,
    waiting: false,
  });
});
it("binds decisions to independent chats even with identical tool ids", async () => {
  const a = controller.event(event("a"));
  const b = controller.event(event("b"));
  await vi.waitFor(() => expect(rows.filter((r) => r.waiting)).toHaveLength(2));
  controller.approve(rows.find((r) => r.conversationId === "a")!.id);
  controller.reject(rows.find((r) => r.conversationId === "b")!.id);
  expect(await a).toMatchObject({ permission: "allow" });
  expect(await b).toMatchObject({ permission: "deny" });
});
it("rechecks file state before releasing a waiting action", async () => {
  const result = controller.event(event());
  const row = await pending();
  writeFileSync(join(root, "demo.txt"), "external change");
  expect(controller.approve(row.id)).toEqual({ ok: false });
  expect(await result).toMatchObject({ permission: "deny" });
});
it("fails closed on cancellation and prevents late approval", async () => {
  const abort = new AbortController();
  const result = controller.event(event(), abort.signal);
  const row = await pending();
  abort.abort();
  expect(await result).toMatchObject({ permission: "deny" });
  expect(controller.approve(row.id)).toEqual({ ok: false });
});
it("fails closed after the bounded wait", async () => {
  vi.useFakeTimers();
  const result = controller.event(event());
  await vi.advanceTimersByTimeAsync(100001);
  expect(await result).toMatchObject({ permission: "deny" });
  expect(rows.at(-1)?.canApprove).toBe(false);
});
it("logs an unknown tool with chat identity and no approval override", async () => {
  expect(
    await controller.event({
      ...event("unknown-chat"),
      tool_name: "NewTool",
      tool_input: { secret: "not persisted" },
    }),
  ).toMatchObject({ permission: "deny" });
  expect(rows.at(-1)).toMatchObject({
    conversationId: "unknown-chat",
    tool: "NewTool",
    status: "blocked",
    canApprove: false,
  });
  expect(JSON.stringify(rows)).not.toContain("not persisted");
});

it("correlates outcomes by tool name when Cursor reuses a tool id", async () => {
  await controller.event({
    ...event(),
    tool_name: "Read",
    tool_input: { path: "demo.txt" },
  });
  const result = controller.event(event());
  const row = await pending();
  await controller.event({
    ...event(),
    hook_event_name: "postToolUse",
    tool_name: "Read",
    tool_input: { path: "demo.txt" },
  });
  expect(controller.inspect(row.id)?.outcome).toBe("not-observed");
  controller.reject(row.id);
  await result;
});
