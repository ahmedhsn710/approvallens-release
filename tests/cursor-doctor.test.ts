import { afterEach, expect, it, vi } from "vitest";
import {
  realpathSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { serviceIdentity } from "../packages/mcp/src/identity";
import { diagnose } from "../packages/companion/src/doctor";
const roots: string[] = [];
afterEach(() =>
  roots.splice(0).forEach((p) => rmSync(p, { recursive: true, force: true })),
);
function fixture() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "al-doctor-")));
  roots.push(dir);
  const root = join(dir, "project"),
    state = join(dir, "private");
  mkdirSync(root);
  mkdirSync(state);
  mkdirSync(join(root, ".cursor"));
  const policy = {
    version: 1,
    taskId: "different-project",
    developerIntent: "Change enabled",
    grants: [{ operation: "write_file", path: "feature.json" }],
    evidence: [{ path: "feature.json", fields: { "/enabled": "boolean" } }],
  };
  const config = join(state, "config.json");
  const save = (path: string, v: unknown) =>
    writeFileSync(path, JSON.stringify(v));
  save(config, { workspace: root, approvalMode: "wait", policy });
  save(join(state, "policy.json"), policy);
  save(join(root, "feature.json"), { enabled: false });
  const quote = (s: string) => "'" + s.replaceAll("'", "'\\''") + "'";
  const command = [
    process.execPath,
    resolve("scripts/cursor-hook.mjs"),
    join(state, "service.sock"),
  ]
    .map(quote)
    .join(" ");
  save(join(root, ".cursor/hooks.json"), {
    version: 1,
    hooks: Object.fromEntries(
      ["preToolUse", "postToolUse", "postToolUseFailure"].map((e) => [
        e,
        [
          {
            command,
            timeout: 120,
            ...(e === "preToolUse" ? { failClosed: true } : {}),
          },
        ],
      ]),
    ),
  });
  save(join(root, ".cursor/mcp.json"), {
    mcpServers: {
      approvallens: {
        command: "MUST_NOT_RUN",
        env: {
          APPROVALLENS_POLICY_FILE: join(state, "policy.json"),
          APPROVALLENS_WORKSPACE: root,
        },
      },
    },
  });
  const probe = vi.fn(async () => ({
    workspace: root,
    version: 1,
    mode: "RULES_ONLY",
    identity: serviceIdentity(policy),
  }));
  return { dir, root, state, config, policy, save, probe };
}
it("checks an unrelated project without changing files or launching MCP", async () => {
  const f = fixture(),
    before = readFileSync(f.config, "utf8");
  const report = await diagnose(f.config, f.state, f.probe);
  expect(report.status).toBe("checks-passed-with-manual-checks");
  expect(report.modelCalls).toBe(0);
  expect(report.checks.filter((x) => x.status === "fail")).toEqual([]);
  expect(f.probe).toHaveBeenCalledOnce();
  expect(readFileSync(f.config, "utf8")).toBe(before);
  expect(
    report.checks.some(
      (c) => c.name === "MCP discovery" && c.status === "warning",
    ),
  ).toBe(true);
});
it("treats missing MCP configuration as optional while requiring native Cursor checks", async () => {
  const f = fixture();
  rmSync(join(f.root, ".cursor/mcp.json"));
  const r = await diagnose(f.config, f.state, f.probe);
  expect(r.status).toBe("checks-passed-with-manual-checks");
  expect(r.checks.find((c) => c.name === "MCP configuration")).toMatchObject({
    status: "warning",
  });
  expect(
    r.checks
      .filter(
        (c) =>
          c.name === "preToolUse" ||
          c.name === "postToolUse" ||
          c.name === "postToolUseFailure",
      )
      .every((c) => c.status === "pass"),
  ).toBe(true);
  expect(r.checks.filter((c) => c.status === "fail")).toEqual([]);
});
it("detects policy drift, missing evidence and incorrect service identity", async () => {
  const f = fixture();
  f.save(join(f.state, "policy.json"), { ...f.policy, grants: [] });
  rmSync(join(f.root, "feature.json"));
  const r = await diagnose(f.config, f.state, async () => ({
    workspace: "/other",
    version: 1,
    mode: "LIVE",
    liveHalted: true,
  }));
  expect(r.status).toBe("not-ready");
  expect(
    r.checks.filter((c) => c.status === "fail").map((c) => c.name),
  ).toEqual(
    expect.arrayContaining([
      "MCP policy",
      "baseline feature.json",
      "service identity",
      "service mode",
      "live stop",
    ]),
  );
});
it("reports an unavailable service and invalid hooks without echoing configuration secrets", async () => {
  const f = fixture();
  f.save(join(f.root, ".cursor/hooks.json"), { secret: "DO_NOT_ECHO" });
  const r = await diagnose(f.config, f.state, async () => {
    throw Error("PRIVATE_PROVIDER_ERROR");
  });
  expect(r.status).toBe("not-ready");
  expect(JSON.stringify(r)).not.toContain("DO_NOT_ECHO");
  expect(JSON.stringify(r)).not.toContain("PRIVATE_PROVIDER_ERROR");
});
it("fails closed on malformed configuration before probing the socket", async () => {
  const f = fixture();
  writeFileSync(f.config, "invalid");
  const r = await diagnose(f.config, f.state, f.probe);
  expect(r.status).toBe("not-ready");
  expect(f.probe).not.toHaveBeenCalled();
});

it("rejects an old service or a loaded policy different from disk", async () => {
  const f = fixture();
  const old = await diagnose(f.config, f.state, async () => ({
    workspace: f.root,
    version: 1,
    mode: "RULES_ONLY",
  }));
  expect(old.checks.find((c) => c.name === "loaded policy")?.status).toBe(
    "fail",
  );
  const drift = await diagnose(f.config, f.state, async () => ({
    workspace: f.root,
    version: 1,
    mode: "RULES_ONLY",
    identity: serviceIdentity({ ...f.policy, grants: [] }),
  }));
  expect(drift.checks.find((c) => c.name === "loaded policy")?.status).toBe(
    "fail",
  );
});
