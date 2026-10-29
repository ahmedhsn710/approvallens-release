import { describe, it, expect, afterEach } from "vitest";
import { createRequire } from "node:module";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  symlinkSync,
  existsSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createConnection } from "node:net";
const require = createRequire(import.meta.url);
const setup = require("../packages/extension/workspace.cjs");
const onboarding = require("../packages/extension/onboarding.cjs");
const roots: string[] = [];
function fixture() {
  const base = mkdtempSync(join(tmpdir(), "al-onboard-"));
  roots.push(base);
  const root = join(base, "repo"),
    state = join(base, "state");
  mkdirSync(root);
  writeFileSync(join(root, "package.json"), "{}");
  return {
    root,
    state,
    runtime: process.env.APPROVALLENS_TEST_RUNTIME || process.execPath,
    extensionPath: resolve("packages/extension"),
    policy: setup.starterPolicy(),
  };
}
afterEach(() => {
  for (const p of roots.splice(0)) rmSync(p, { recursive: true, force: true });
});
function rpc(socket: string, body: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    const client = createConnection(socket);
    let data = "";
    client.setTimeout(5000, () => client.destroy(Error("timeout")));
    client.on("connect", () => client.write(JSON.stringify(body) + "\n"));
    client.on("data", (x) => (data += x));
    client.on("error", reject);
    client.on("end", () => {
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
  });
}
describe("bundled extension onboarding", () => {
  it("preserves unrelated settings, is idempotent, and removes only owned entries", () => {
    const options = fixture();
    mkdirSync(join(options.root, ".cursor"));
    writeFileSync(
      join(options.root, ".cursor/hooks.json"),
      JSON.stringify({
        version: 1,
        hooks: { preToolUse: [{ command: "existing" }] },
      }),
    );
    writeFileSync(
      join(options.root, ".cursor/mcp.json"),
      JSON.stringify({ mcpServers: { other: { url: "https://example.com" } } }),
    );
    setup.configure(options);
    setup.configure(options);
    const hooks = JSON.parse(
      readFileSync(join(options.root, ".cursor/hooks.json"), "utf8"),
    );
    expect(hooks.hooks.preToolUse).toHaveLength(2);
    expect(hooks.hooks.preToolUse[1].failClosed).toBe(true);
    setup.disable(options.root, options.state);
    expect(
      JSON.parse(readFileSync(join(options.root, ".cursor/hooks.json"), "utf8"))
        .hooks.preToolUse,
    ).toEqual([{ command: "existing" }]);
    expect(
      JSON.parse(readFileSync(join(options.root, ".cursor/mcp.json"), "utf8"))
        .mcpServers,
    ).toEqual({ other: { url: "https://example.com" } });
  });
  it("does not trust edited workspace rules automatically", () => {
    const options = fixture();
    setup.configure(options);
    writeFileSync(join(options.root, ".approvallens/rules.json"), "{}");
    setup.configure(options);
    expect(
      JSON.parse(readFileSync(join(options.state, "config.json"), "utf8"))
        .policy,
    ).toEqual(options.policy);
    expect(
      readFileSync(join(options.root, ".approvallens/rules.json"), "utf8"),
    ).toBe("{}");
  });
  it("refuses symlink destinations and conflicting MCP entries", () => {
    const options = fixture();
    const outside = join(options.root, "../other");
    mkdirSync(outside);
    symlinkSync(outside, join(options.root, ".cursor"));
    expect(() => setup.configure(options)).toThrow("symlink");
    unlinkSync(join(options.root, ".cursor"));
    mkdirSync(join(options.root, ".cursor"));
    writeFileSync(
      join(options.root, ".cursor/mcp.json"),
      JSON.stringify({
        mcpServers: { approvallens: { url: "https://other.example" } },
      }),
    );
    expect(() => setup.configure(options)).toThrow("conflicts");
    expect(existsSync(join(options.root, ".cursor/hooks.json"))).toBe(false);
  });
  it("runs the bundle without npm/SQLite, holds a write, accepts a human decision, and protects rules", async () => {
    const options = fixture();
    options.policy.grants.push(
      { operation: "write_file", path: "package.json" },
      { operation: "write_file", path: ".approvallens/rules.json" },
    );
    const { socket, config } = setup.configure(options);
    const child = spawn(
      options.runtime,
      [resolve("packages/extension/dist/companion.cjs"), config, options.state],
      {
        cwd: options.root,
        stdio: "pipe",
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      },
    );
    try {
      for (let n = 0; n < 100 && !existsSync(socket); n++)
        await new Promise((r) => setTimeout(r, 20));
      expect((await rpc(socket, { method: "list" })).result.mode).toBe(
        "RULES_ONLY",
      );
      const event = {
        hook_event_name: "preToolUse",
        conversation_id: "chat-a",
        tool_use_id: "write-a",
        tool_name: "Write",
        workspace_roots: [options.root],
        tool_input: { path: "package.json", content: '{"name":"test"}' },
      };
      const pending = new Promise<any>((yes, no) => {
        const hook = spawn(
          options.runtime,
          [resolve("packages/extension/dist/hook.mjs"), socket],
          { stdio: "pipe", env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } },
        );
        let text = "";
        hook.stdout.on("data", (data) => (text += data));
        hook.on("error", no);
        hook.on("exit", (code) => {
          try {
            if (code !== 0) throw Error("Hook failed");
            yes({ result: JSON.parse(text) });
          } catch (e) {
            no(e);
          }
        });
        hook.stdin.end(JSON.stringify(event));
      });
      let row: any;
      for (let n = 0; n < 100; n++) {
        row = (await rpc(socket, { method: "list" })).result.events.find(
          (r: any) => r.canApprove,
        );
        if (row) break;
        await new Promise((r) => setTimeout(r, 20));
      }
      expect(row.waiting).toBe(true);
      expect(readFileSync(join(options.root, "package.json"), "utf8")).toBe(
        "{}",
      );
      expect(
        (await rpc(socket, { method: "approve", id: row.id })).result.ok,
      ).toBe(true);
      expect((await pending).result.permission).toBe("allow");
      const denied = await rpc(socket, {
        method: "event",
        event: {
          ...event,
          tool_use_id: "write-b",
          tool_input: { path: ".approvallens/rules.json", content: "{}" },
        },
      });
      expect(denied.result.permission).toBe("deny");
      // Guard grants permission only; it never performs the write itself.
      expect(readFileSync(join(options.root, "package.json"), "utf8")).toBe(
        "{}",
      );
    } finally {
      if (child.exitCode === null) {
        const done = new Promise((r) => child.once("exit", r));
        child.kill();
        await done;
      }
    }
  }, 10000);
  it("keeps the rule-suggestion file list scrollable with the confirm button in view", () => {
    const html = onboarding.inventoryConsentHtml(
      {
        intent: "fix <script>alert(1)</script>",
        paths: ["src/a.ts", "a&b/<tag>.ts"],
        stack: ["TypeScript"],
      },
      "nonce-test",
    );
    expect(html).toContain('<main tabindex="0">');
    expect(html).toContain("overflow:auto");
    expect(html).toContain('data-action="Suggest rules"');
    expect(html).toContain(">Suggest rules<");
    expect(html).toContain("script-src 'nonce-nonce-test'");
    expect(html).toContain("fix &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("a&amp;b/&lt;tag&gt;.ts");
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<tag>");
  });
});
