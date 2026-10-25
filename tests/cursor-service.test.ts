import { serviceIdentity } from "../packages/mcp/src/identity";
import { diagnose } from "../packages/companion/src/doctor";
import { expect, it } from "vitest";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { createConnection } from "node:net";
import {
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";

it("persists the audit trail but invalidates approvals after a real service restart", async () => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "al-ipc-")));
  const workspace = join(base, "workspace"),
    state = join(base, "state"),
    config = join(state, "config.json");
  mkdirSync(workspace);
  mkdirSync(state);
  writeFileSync(join(workspace, "demo.txt"), "before");
  writeFileSync(
    config,
    JSON.stringify({
      workspace,
      policy: {
        version: 1,
        taskId: "restart",
        developerIntent: "Update demo.txt",
        grants: [{ operation: "write_file", path: "demo.txt" }],
      },
    }),
  );
  const socket = join(state, "service.sock");
  let child: ChildProcess | undefined;
  async function start() {
    child = spawn(
      process.execPath,
      [resolve("scripts/cursor-service.mjs"), config, state],
      { cwd: "/tmp", stdio: ["ignore", "pipe", "pipe"] },
    );
    await new Promise<void>((yes, no) => {
      const timer = setTimeout(
        () => no(Error("Service readiness timeout")),
        8000,
      );
      child!.once("exit", (code) => {
        clearTimeout(timer);
        no(Error(`Service exited ${code}`));
      });
      child!.once("error", (e) => {
        clearTimeout(timer);
        no(e);
      });
      child!.stderr!.on("data", (b) => {
        if (String(b).includes("local service ready")) {
          clearTimeout(timer);
          yes();
        }
      });
    });
  }
  async function stop() {
    if (child?.exitCode === null) {
      const done = once(child, "exit");
      child.kill("SIGTERM");
      await done;
    }
  }
  function rpc(method: string, extra: Record<string, unknown> = {}) {
    return new Promise<any>((yes, no) => {
      const client = createConnection(socket);
      let text = "";
      client.setTimeout(3000, () => client.destroy(Error("timeout")));
      client.on("error", no);
      client.on("connect", () =>
        client.write(JSON.stringify({ method, ...extra }) + "\n"),
      );
      client.on("data", (b) => (text += b));
      client.on("end", () => {
        try {
          const r = JSON.parse(text);
          expect(r.ok).toBe(true);
          yes(r.result);
        } catch (e) {
          no(e);
        }
      });
    });
  }
  try {
    mkdirSync(join(workspace, ".cursor"));
    writeFileSync(
      join(workspace, ".cursor/hooks.json"),
      JSON.stringify({
        version: 1,
        hooks: { preToolUse: [{ command: "unrelated-hook-preserved" }] },
      }),
    );
    // Real installer, foreign cwd, separate project and state. Never execute configured hook commands.
    for (let i = 0; i < 2; i++)
      execFileSync(
        process.execPath,
        [resolve("scripts/cursor-setup.mjs"), workspace, state],
        { cwd: "/tmp" },
      );
    const hooks = JSON.parse(
      readFileSync(join(workspace, ".cursor/hooks.json"), "utf8"),
    );
    expect(hooks.hooks.preToolUse).toHaveLength(2);
    expect(hooks.hooks.preToolUse[0].command).toBe("unrelated-hook-preserved");
    const initial = JSON.parse(readFileSync(config, "utf8"));
    const policyFile = join(state, "policy.json");
    writeFileSync(policyFile, JSON.stringify(initial.policy));
    writeFileSync(
      join(workspace, ".cursor/mcp.json"),
      JSON.stringify({
        mcpServers: {
          approvallens: {
            env: {
              APPROVALLENS_POLICY_FILE: policyFile,
              APPROVALLENS_WORKSPACE: workspace,
            },
          },
        },
      }),
    );
    await start();
    expect((await rpc("list")).identity).toEqual(
      serviceIdentity(initial.policy),
    );
    expect((await diagnose(config, state)).status).toBe(
      "checks-passed-with-manual-checks",
    );
    const changed = {
      ...initial,
      policy: {
        ...initial.policy,
        developerIntent: "Updated developer intent",
      },
    };
    writeFileSync(config, JSON.stringify(changed));
    writeFileSync(policyFile, JSON.stringify(changed.policy));
    expect(
      (await diagnose(config, state)).checks.find(
        (c) => c.name === "loaded policy",
      )?.status,
    ).toBe("fail");
    const event = {
      hook_event_name: "preToolUse",
      conversation_id: "test",
      tool_use_id: "first",
      tool_name: "Write",
      tool_input: { path: "demo.txt", content: "after" },
      workspace_roots: [workspace],
    };
    expect(await rpc("event", { event })).toMatchObject({ permission: "deny" });
    const row = (await rpc("list")).events[0];
    expect(await rpc("approve", { id: row.id })).toEqual({ ok: true });
    await stop();
    await start();
    expect((await rpc("list")).identity).toEqual(
      serviceIdentity(changed.policy),
    );
    expect((await diagnose(config, state)).status).toBe(
      "checks-passed-with-manual-checks",
    );
    expect((await rpc("list")).events[0]).toMatchObject({
      status: "expired",
      canApprove: false,
    });
    expect(
      await rpc("event", { event: { ...event, tool_use_id: "retry" } }),
    ).toMatchObject({ permission: "deny" });
  } finally {
    await stop();
    rmSync(base, { recursive: true, force: true });
  }
}, 20000);
