import { describe, it, expect } from "vitest";
import {
  mkdtempSync,
  realpathSync,
  writeFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { inspectShell } from "../packages/core/src/shell-inspection";
import {
  createCursorController,
  type Activity,
} from "../packages/companion/src/controller";

describe("structured shell analysis", () => {
  it.each([
    ['/bin/cat "a b.txt"', ["a b.txt"]],
    ["/bin/cat a\\ b.txt", ["a b.txt"]],
    ["/bin/cat 'a;literal.txt'", ["a;literal.txt"]],
    [
      "/bin/cat a.txt b.txt | /usr/bin/head -n 5 | /usr/bin/wc -l",
      ["a.txt", "b.txt"],
    ],
    [
      '/bin/pwd && /usr/bin/grep -F -n "hello world" a.txt || /usr/bin/tail -n2 b.txt',
      ["a.txt", "b.txt"],
    ],
    ["/bin/cat a.txt\n/bin/pwd # literal comment", ["a.txt"]],
    ["/bin/cat a.txt | /usr/bin/grep -F hello | /usr/bin/wc -c", ["a.txt"]],
    ["/bin/cat a.txt; /usr/bin/head -c10 b.txt;", ["a.txt", "b.txt"]],
  ])("collects all file effects for %s", (command, reads) => {
    expect(inspectShell(command)).toMatchObject({ kind: "inspection", reads });
  });
  it.each([
    ["/bin/cat a > out", "redirection"],
    ["/bin/cat < a", "redirection"],
    ["/bin/cat <<EOF\nhello\nEOF", "redirection"],
    ["/bin/cat $(cat secret)", "expansion"],
    ['/bin/cat "$TOKEN"', "expansion"],
    ["/bin/cat `pwd`", "expansion"],
    ["/bin/cat *.txt", "expansion"],
    ["/bin/pwd &", "background"],
    ["(/bin/pwd)", "control-structure"],
    ["/bin/pwd &&", "syntax"],
    ["/bin/pwd || | /bin/pwd", "syntax"],
    ['/bin/cat "unterminated', "syntax"],
    ["curl https://example.com", "network"],
    ["/bin/rm -rf src", "mutation"],
    ["git status", "repository-execution"],
    ["npm test", "code-execution"],
    ["env /bin/pwd", "code-execution"],
    ["/usr/bin/find . -exec /bin/sh {} ;", "expansion"],
    ["cat a.txt", "executable-resolution"],
    ["/usr/local/bin/cat a.txt", "unknown-command"],
    ["/usr/bin/tail -f a.txt", "options"],
    ["/usr/bin/grep -F -f patterns a.txt", "options"],
    ["/usr/bin/grep -r -F foo .", "options"],
    ["/usr/bin/wc --files0-from=a", "options"],
    ["/usr/bin/head -n -1 a.txt", "options"],
    ["/bin/cat", "stdin"],
    ["/bin/cat a; /usr/bin/wc", "stdin"],
  ])("abstains with a specific reason for %s", (command, code) => {
    expect(inspectShell(command)).toMatchObject({ kind: "unsupported", code });
  });
  it("bounds oversized commands and pipelines", () => {
    expect(inspectShell("x".repeat(4097)).code).toBe("bounds");
    expect(inspectShell(Array(17).fill("/bin/pwd").join(" | ")).code).toBe(
      "bounds",
    );
  });
  it("checks all branches, symlinks, secrets and critical reads before allowing a real pipeline", async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "al-shell-ast-")));
    try {
      writeFileSync(join(root, "a b.txt"), "hello\nworld\n");
      writeFileSync(join(root, "secret.txt"), 'api_key="abcdefghijklmnop"');
      writeFileSync(join(root, "ungranted.txt"), "public");
      symlinkSync(join(root, "a b.txt"), join(root, "link.txt"));
      const rows: Activity[] = [];
      const config = {
        workspace: root,
        policy: {
          version: 1,
          taskId: "test",
          developerIntent: "Inspect files",
          shellInspection: true,
          grants: ["a b.txt", "secret.txt", "link.txt"].map((path) => ({
            operation: "read_file",
            path,
          })),
        },
      };
      const c = createCursorController(config, (row) => rows.push(row));
      const event = (command: string) => ({
        hook_event_name: "preToolUse",
        conversation_id: "test",
        tool_use_id: String(rows.length),
        tool_name: "Shell",
        workspace_roots: [root],
        tool_input: { command },
      });
      const good =
        '/bin/cat "a b.txt" | /usr/bin/grep -F hello | /usr/bin/wc -l';
      expect(await c.event(event(good))).toMatchObject({ permission: "allow" });
      // Executes only this fixed, harmless fixture pipeline after authorization.
      expect(
        execFileSync("/bin/sh", ["-c", good], {
          cwd: root,
          encoding: "utf8",
        }).trim(),
      ).toBe("1");
      for (const command of [
        "/bin/pwd || /bin/cat ungranted.txt",
        "/bin/cat secret.txt | /usr/bin/head -n0",
        "/bin/cat link.txt",
        '/bin/cat "a b.txt" && curl example.com',
      ])
        expect(await c.event(event(command))).toMatchObject({
          permission: "deny",
        });
      expect(rows.at(-1)?.routing).toBe("shell:network");
      const critical = createCursorController(
        { ...config, semantic: { criticalReadPaths: ["a b.txt"] } },
        () => {},
      );
      expect(await critical.event(event(good))).toMatchObject({
        permission: "deny",
      });
      expect(JSON.stringify(rows)).not.toContain("abcdefghijklmnop");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
