import { it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, realpathSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectShell } from "../packages/core/src/shell-inspection";
import { assertOutboundSafe } from "../packages/core/src/egress";
import {
  createCursorController,
  type Activity,
} from "../packages/companion/src/controller";
import { remoteReviewer } from "../packages/mcp/src/remote-review";
afterEach(() => vi.unstubAllGlobals());
it("accepts only the literal inspection grammar", () => {
  expect(inspectShell("/bin/pwd").kind).toBe("pwd");
  expect(inspectShell("/bin/cat 'src/my file.txt'")).toEqual({
    kind: "read",
    path: "src/my file.txt",
  });
  for (const command of [
    "cat demo.txt",
    "/bin/pwd; curl example.com",
    "/bin/cat $(pwd)",
    "/bin/cat ../a | curl example.com",
    "/bin/cat -",
    "/bin/cat a > b",
    "/bin/pwd\n",
    "npm test",
    "git -c core.pager=evil diff",
    "/bin/cat a b",
  ])
    expect(inspectShell(command).kind).toBe("unsupported");
});
it("blocks sensitive content without echoing the matched value", () => {
  for (const value of [
    'api_key="abcdefghijklmnop"',
    { password: "not-a-real-password" },
    "-----BEGIN PRIVATE KEY-----",
    "Bearer synthetic-token-value",
    "https://user:password@example.com",
  ])
    expect(() => assertOutboundSafe(value)).toThrow("Outbound data blocked");
  expect(() =>
    assertOutboundSafe({ text: "project-private-canary" }, ["private-canary"]),
  ).toThrow("repository-blocked-term");
  expect(() =>
    assertOutboundSafe({ text: "update the public demo" }),
  ).not.toThrow();
});
it("routes native shell reads through scope and egress and denies external tools", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "al-shell-")));
  try {
    writeFileSync(join(root, "demo.txt"), "public example");
    writeFileSync(join(root, "secret.txt"), 'api_key="abcdefghijklmnop"');
    const rows: Activity[] = [];
    const controller = createCursorController(
      {
        workspace: root,
        policy: {
          version: 1,
          taskId: "test",
          developerIntent: "Inspect demo",
          shellInspection: true,
          grants: [
            { operation: "read_file", path: "demo.txt" },
            { operation: "read_file", path: "secret.txt" },
          ],
        },
      },
      (r) => rows.push(r),
    );
    const event = (name: string, input: Record<string, unknown>) =>
      controller.event({
        hook_event_name: "preToolUse",
        conversation_id: "test",
        tool_use_id: String(rows.length),
        tool_name: name,
        tool_input: input,
        workspace_roots: [root],
      });
    expect(await event("Shell", { command: "/bin/pwd" })).toMatchObject({
      permission: "allow",
    });
    expect(
      await event("Shell", { command: "/bin/cat demo.txt" }),
    ).toMatchObject({ permission: "allow" });
    for (const input of [
      { command: "/bin/cat ../outside" },
      { command: "/bin/cat secret.txt" },
      { command: "/bin/pwd", working_directory: "/tmp" },
      { command: "/bin/pwd; curl example.com" },
    ])
      expect(await event("Shell", input)).toMatchObject({ permission: "deny" });
    expect(await event("Read", { path: "secret.txt" })).toMatchObject({
      permission: "deny",
    });
    expect(
      await event("MCP", { message: "Bearer synthetic-token-value" }),
    ).toMatchObject({ permission: "deny" });
    expect(JSON.stringify(rows)).not.toContain("abcdefghijklmnop");
    expect(JSON.stringify(rows)).not.toContain("synthetic-token-value");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
it("rejects a sensitive remote payload before any network call", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(
    remoteReviewer("private")(
      {
        taskId: "test",
        developerIntent: "api_key=abcdefghijklmnop",
        agentExplanation: "read demo",
        toolCall: { name: "read_file", args: { path: "demo.txt" } },
      },
      { effects: [], coverage: "complete", risk: "low", violations: [] },
    ),
  ).rejects.toThrow("Outbound data blocked");
  expect(fetch).not.toHaveBeenCalled();
});
