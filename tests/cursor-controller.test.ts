import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createCursorController,
  type Activity,
} from "../packages/companion/src/controller";

describe("Cursor native controller", () => {
  let root: string,
    rows: Activity[],
    clock: number,
    controller: ReturnType<typeof createCursorController>;
  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), "approvallens-native-")));
    rows = [];
    clock = 100000;
    writeFileSync(join(root, "demo.txt"), "before");
    controller = createCursorController(
      {
        workspace: root,
        policy: {
          version: 1,
          taskId: "test",
          developerIntent: "Read or update demo.txt",
          grants: [
            { operation: "read_file", path: "demo.txt" },
            { operation: "write_file", path: "demo.txt" },
          ],
        },
      },
      (row) => rows.push(row),
      () => clock,
    );
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));
  const event = (
    tool_name: string,
    tool_input: Record<string, unknown>,
    root: string,
    tool_use_id = "call",
  ) => ({
    hook_event_name: "preToolUse",
    conversation_id: "chat",
    tool_use_id,
    tool_name,
    tool_input,
    workspace_roots: [root],
  });
  it("allows exact read grants without claiming semantic review", async () => {
    expect(
      await controller.event(event("Read", { path: "demo.txt" }, root)),
    ).toMatchObject({ permission: "allow" });
    expect(rows.at(-1)).toMatchObject({
      status: "policy-allowed",
      intent: "NOT_MEASURED",
    });
  });
  it("does not offer approval when configured restrictions cannot be assessed by the native adapter", async () => {
    const restricted = createCursorController(
      {
        workspace: root,
        policy: {
          version: 1,
          taskId: "restricted",
          developerIntent: "Update config",
          grants: [{ operation: "write_file", path: "demo.txt" }],
          constraints: [
            {
              id: "preserve-auth",
              kind: "preserve_field",
              path: "demo.txt",
              field: "authEnabled",
            },
          ],
        },
      },
      (row) => rows.push(row),
      () => clock,
    );
    const result = await restricted.event(
      event("Write", { path: "demo.txt", content: "{}" }, root),
    );
    expect(result.permission).toBe("deny");
    expect(rows.at(-1)?.canApprove).toBe(false);
    expect(rows.at(-1)?.reason).toContain("configure supported JSON evidence");
    expect(restricted.approve(rows.at(-1)!.id).ok).toBe(false);
  });
  it("does not let a read/write grant authorize deletion or shell", async () => {
    for (const [name, input] of [
      ["Delete", { path: "demo.txt" }],
      ["Shell", { command: "cat demo.txt" }],
    ] as const) {
      expect(await controller.event(event(name, input, root))).toMatchObject({
        permission: "deny",
      });
      expect(rows.at(-1)?.canApprove).toBe(false);
    }
  });
  it("denies a Cursor shell payload that includes extra fields", async () => {
    const result = await controller.event(
      event(
        "Shell",
        {
          command: "echo ApprovalLens-demo",
          description: "demo",
          working_directory: root,
        },
        root,
      ),
    );
    expect(result).toMatchObject({
      permission: "deny",
      user_message:
        "ApprovalLens: Opaque shell command: unassessed, high risk, never approvable.",
    });
    expect(rows.at(-1)).toMatchObject({
      status: "blocked",
      target: "opaque shell",
      canApprove: false,
    });
    expect(JSON.stringify(rows.at(-1))).not.toContain("working_directory");
  });
  it("requires a single-use identical mutation retry", async () => {
    const input = event("Write", { path: "demo.txt", content: "after" }, root);
    expect(await controller.event(input)).toMatchObject({ permission: "deny" });
    const id = rows.at(-1)!.id;
    expect(controller.inspect(id)).toMatchObject({
      proposedAction: { name: "write_file", args: { content: "after" } },
    });
    expect(controller.approve(id)).toEqual({ ok: true });
    expect(
      await controller.event({ ...input, tool_use_id: "retry" }),
    ).toMatchObject({ permission: "allow" });
    expect(
      await controller.event({ ...input, tool_use_id: "again" }),
    ).toMatchObject({ permission: "deny" });
  });
  it("invalidates authorization when file state changes", async () => {
    const input = event("Write", { path: "demo.txt", content: "after" }, root);
    await controller.event(input);
    controller.approve(rows.at(-1)!.id);
    writeFileSync(join(root, "demo.txt"), "changed externally");
    expect(await controller.event(input)).toMatchObject({ permission: "deny" });
  });
  it("binds authorization to arguments and conversation", async () => {
    const input = event("Write", { path: "demo.txt", content: "after" }, root);
    await controller.event(input);
    controller.approve(rows.at(-1)!.id);
    expect(
      await controller.event({ ...input, conversation_id: "other" }),
    ).toMatchObject({ permission: "deny" });
    expect(
      await controller.event({
        ...input,
        tool_input: { path: "demo.txt", content: "different" },
      }),
    ).toMatchObject({ permission: "deny" });
  });
  it("expires approval and pending review", async () => {
    const input = event("Write", { path: "demo.txt", content: "after" }, root);
    await controller.event(input);
    controller.approve(rows.at(-1)!.id);
    clock += 30001;
    expect(await controller.event(input)).toMatchObject({ permission: "deny" });
    const id = rows.at(-1)!.id;
    clock += 300001;
    expect(controller.approve(id)).toEqual({ ok: false });
  });
  it("rejects escapes, symlinks, ambiguous paths and unmapped arguments", async () => {
    symlinkSync(join(root, "demo.txt"), join(root, "link"));
    for (const input of [
      { path: "../outside" },
      { path: "link" },
      { path: "demo.txt", file_path: "demo.txt" },
      { path: "demo.txt", recursive: true },
    ]) {
      expect(await controller.event(event("Read", input, root))).toMatchObject({
        permission: "deny",
      });
      expect(rows.at(-1)?.canApprove).toBe(false);
    }
  });
  it("does not persist content or agent explanations", async () => {
    await controller.event({
      ...event("Write", { path: "demo.txt", content: "secret-canary" }, root),
      agent_message: "sensitive-explanation",
    });
    expect(JSON.stringify(rows)).not.toContain("secret-canary");
    expect(JSON.stringify(rows)).not.toContain("sensitive-explanation");
  });
  it("correlates outcomes without claiming successful effects", async () => {
    const input = event("Read", { path: "demo.txt" }, root);
    await controller.event(input);
    await controller.event({ ...input, hook_event_name: "postToolUse" });
    expect(rows.at(-1)?.outcome).toBe("tool-returned");
  });
  it("rejects a different workspace", async () => {
    await expect(
      controller.event(event("Read", { path: "demo.txt" }, tmpdir())),
    ).resolves.toMatchObject({ permission: "deny" });
  });
});
