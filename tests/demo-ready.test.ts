import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { judgeSteps, locateCursor } from "../scripts/demo-ready.ts";
import { needsInstall, prerequisiteMessage } from "../scripts/demo-ready.mjs";

const roots: string[] = [];
const pids: number[] = [];
afterEach(() => {
  for (const pid of pids.splice(0)) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* already stopped */
    }
  }
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

it("stops for a missing Cursor or Node install and skips npm ci when dependencies exist", () => {
  expect(prerequisiteMessage({ PATH: "", CURSOR_BIN: "" }, [])).toContain(
    "https://cursor.com/download",
  );
  expect(needsInstall(join(rootForInstall(), "empty"))).toBe(true);
  expect(needsInstall(resolve("."))).toBe(false);
});

function rootForInstall() {
  const root = realpathSync(mkdtempSync("/tmp/al-ready-"));
  roots.push(root);
  return root;
}

it("prints the remaining human steps without approving a write", () => {
  const text = judgeSteps({
    workspace: "/tmp/sample/project",
    vsix: "/tmp/sample.vsix",
    serviceLog: "/tmp/sample/state/service.log",
    servicePid: "/tmp/sample/state/service.pid",
    cli: null,
  });
  expect(text).toContain("did not approve a write");
  expect(text).toContain("did not call a model");
  expect(text).toContain("Reload the window only if");
  expect(text).toContain("ApprovalLens shield → Activity");
  expect(text).toContain("Click a prompt in the shield");
  expect(text).toContain("click Approve once yourself");
  expect(text).toContain("Use Read to read package.json");
  expect(text).toContain('retries":1');
  expect(text).toContain('retries":2');
  expect(text).toContain("echo ApprovalLens-demo");
  expect(text).toContain("cursor --install-extension '/tmp/sample.vsix'");
  expect(text).not.toContain("human-approved");
});

it("uses an explicit Cursor executable and ignores a missing one", () => {
  const root = realpathSync(mkdtempSync("/tmp/al-ready-"));
  roots.push(root);
  const bin = join(root, "cursor");
  writeFileSync(bin, "#!/bin/sh\n");
  chmodSync(bin, 0o755);
  expect(locateCursor({ pathEnv: "", candidates: [], envBin: bin })).toBe(bin);
  expect(
    locateCursor({
      pathEnv: "",
      candidates: [join(root, "missing")],
      envBin: "",
    }),
  ).toBeNull();
});

it("creates a settings sample and starts the checker without Cursor or a model call", () => {
  const root = realpathSync(mkdtempSync("/tmp/al-ready-"));
  roots.push(root);
  const vsix = join(root, "extension.vsix");
  writeFileSync(vsix, "not-installed");
  const destination = join(root, "fresh");
  const run = spawnSync(
    process.execPath,
    ["--import", "tsx", resolve("scripts/demo-ready.ts"), destination],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        APPROVALLENS_DEMO_READY_NO_CURSOR: "1",
        APPROVALLENS_DEMO_READY_VSIX: vsix,
      },
    },
  );
  expect(run.status, run.stderr).toBe(0);
  expect(run.stdout).toContain("did not approve a write");
  expect(run.stdout).toContain("click Approve once yourself");
  const config = JSON.parse(
    readFileSync(join(destination, "state", "config.json"), "utf8"),
  );
  expect(config.semantic).toMatchObject({ mode: "rules-only", maxCalls: 0 });
  expect(existsSync(join(destination, "state", "service.sock"))).toBe(true);
  const pid = Number(
    readFileSync(join(destination, "state", "service.pid"), "utf8"),
  );
  expect(pid).toBeGreaterThan(0);
  pids.push(pid);
});
