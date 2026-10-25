/** Read-only setup checks. Never launches configured commands or submits actions. */
import { readFileSync, realpathSync, lstatSync, existsSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
import { createConnection } from "node:net";
import {
  canonicalPolicy,
  policyHash,
  serviceIdentity,
} from "../../mcp/src/identity";
import { pathToFileURL, fileURLToPath } from "node:url";
import { CursorConfig } from "./controller";
import { IntegrationPolicy } from "../../mcp/src/core";
import { createEvidenceProvider } from "../../mcp/src/evidence";

type Check = {
  name: string;
  status: "pass" | "fail" | "warning";
  message: string;
};
const json = (path: string) => {
  if (lstatSync(path).size > 65536) throw Error("oversized");
  return JSON.parse(readFileSync(path, "utf8"));
};
const outside = (root: string, path: string) => {
  const rel = relative(root, realpathSync(path));
  return !!rel && (rel === ".." || rel.startsWith("../") || isAbsolute(rel));
};
export async function diagnose(
  configPath: string,
  stateDir: string,
  probe = statusProbe,
) {
  const checks: Check[] = [];
  const add = (name: string, status: Check["status"], message: string) =>
    checks.push({ name, status, message });
  add(
    "node",
    Number(process.versions.node.split(".")[0]) >= 24 ? "pass" : "fail",
    "Node 24 or later required.",
  );
  let config;
  try {
    config = CursorConfig.parse(json(configPath));
  } catch {
    return {
      status: "not-ready",
      checks: [
        ...checks,
        {
          name: "configuration",
          status: "fail",
          message: "Configuration is unreadable, oversized or invalid.",
        },
      ],
      modelCalls: 0,
    };
  }
  let root: string;
  try {
    root = realpathSync(config.workspace);
    if (!lstatSync(root).isDirectory()) throw Error();
  } catch {
    return {
      status: "not-ready",
      checks: [
        ...checks,
        {
          name: "workspace",
          status: "fail",
          message: "Project directory is unavailable.",
        },
      ],
      modelCalls: 0,
    };
  }
  for (const [name, path] of [
    ["policy location", configPath],
    ["state location", stateDir],
  ] as const) {
    try {
      add(
        name,
        outside(root, path) ? "pass" : "fail",
        "Configuration and state must be outside the inspected project.",
      );
    } catch {
      add(name, "fail", "Location is unavailable.");
    }
  }
  add(
    "approval mode",
    config.approvalMode === "wait" ? "pass" : "warning",
    config.approvalMode === "wait"
      ? "Eligible mutations wait for one human decision."
      : "Retry mode is configured; the waiting-dialog demo requires wait mode.",
  );
  const socket = resolve(stateDir, "service.sock");
  try {
    const hooks = json(resolve(root, ".cursor/hooks.json"));
    const quote = (s: string) => "'" + s.replaceAll("'", "'\\''") + "'";
    const script = fileURLToPath(
      new URL("../../../scripts/cursor-hook.mjs", import.meta.url),
    );
    const command = [process.execPath, script, socket].map(quote).join(" ");
    for (const event of ["preToolUse", "postToolUse", "postToolUseFailure"]) {
      const entries = hooks.hooks?.[event];
      const matching = Array.isArray(entries)
        ? entries.filter((e) => e.command === command)
        : [];
      const ok =
        hooks.version === 1 &&
        matching.length === 1 &&
        matching[0].timeout >= 120 &&
        (event !== "preToolUse" || matching[0].failClosed === true);
      add(
        event,
        ok ? "pass" : "fail",
        ok
          ? "Exact hook registration found."
          : "Regenerate hooks using cursor:setup with this Node runtime; exact command, timeout or failClosed differs.",
      );
    }
  } catch {
    add("hooks", "fail", "Project hooks are missing or invalid.");
  }
  const mcpConfigPath = resolve(root, ".cursor/mcp.json");
  if (!existsSync(mcpConfigPath)) {
    add(
      "MCP configuration",
      "warning",
      "MCP is not configured for this project; native Cursor checks continue independently.",
    );
  } else
    try {
      const entry = json(mcpConfigPath).mcpServers?.approvallens;
      const env = entry?.env;
      if (!env?.APPROVALLENS_POLICY_FILE) throw Error();
      const policy = IntegrationPolicy.parse(
        json(env.APPROVALLENS_POLICY_FILE),
      );
      add(
        "MCP policy",
        canonicalPolicy(policy) === canonicalPolicy(config.policy)
          ? "pass"
          : "fail",
        "MCP and native policy must match; this check does not rewrite either.",
      );
      add(
        "MCP workspace",
        realpathSync(env.APPROVALLENS_WORKSPACE) === root ? "pass" : "fail",
        "MCP evidence workspace must match the native project.",
      );
      add(
        "MCP discovery",
        "warning",
        "Configuration inspected only; no configured command launched. Run integration:doctor separately to verify tool discovery.",
      );
    } catch {
      add(
        "MCP configuration",
        "fail",
        "MCP entry, policy or evidence workspace is missing or invalid.",
      );
    }
  try {
    const evidence = createEvidenceProvider(root);
    for (const entry of config.policy.evidence ?? []) {
      try {
        const context = evidence(
          { name: "delete_file", args: { path: entry.path } },
          entry,
        );
        add(
          `baseline ${entry.path}`,
          context?.before !== null && context?.before !== undefined
            ? "pass"
            : "fail",
          "Baseline availability only; proposed changes still need pipeline inspection.",
        );
      } catch {
        add(
          `baseline ${entry.path}`,
          "fail",
          "Baseline is unreadable, oversized, a symlink or unsupported.",
        );
      }
    }
  } catch {
    add("evidence workspace", "fail", "Cannot safely read local evidence.");
  }
  try {
    const status = await probe(socket);
    add(
      "service identity",
      status.workspace === root && status.version === 1 ? "pass" : "fail",
      "Running service must report this project and protocol version 1.",
    );
    add(
      "service mode",
      status.mode === (config.semantic.mode === "live" ? "LIVE" : "RULES_ONLY")
        ? "pass"
        : "fail",
      "Running service mode must match configuration.",
    );
    add(
      "live stop",
      status.liveHalted ? "fail" : "pass",
      status.liveHalted
        ? "Invalid reviewer reply halted live calls; no automatic reset."
        : "No live halt reported.",
    );
    const expected = serviceIdentity(config.policy);
    add(
      "loaded policy",
      status.identity?.policyHash === expected.policyHash ? "pass" : "fail",
      "Loaded policy must match disk configuration; restart an older or stale service.",
    );
    add(
      "service versions",
      canonicalPolicy(status.identity?.versions) ===
        canonicalPolicy(expected.versions)
        ? "pass"
        : "fail",
      "Analyzer, scope, evidence, policy and integration versions must match this checkout. This does not attest every source byte.",
    );
  } catch {
    add(
      "service",
      "fail",
      "Service unreachable or invalid response. Start cursor:service with this config and state directory.",
    );
  }
  add(
    "extension",
    "warning",
    "In Cursor, verify extension 0.3.2 or later, socket setting, workspace trust and shield → Activity. Disk configuration alone cannot verify activation.",
  );
  return {
    status: checks.some((c) => c.status === "fail")
      ? "not-ready"
      : "checks-passed-with-manual-checks",
    workspace: root,
    policyHash: policyHash(config.policy),
    checks,
    modelCalls: 0,
    actionsExecuted: 0,
  };
}
function statusProbe(socket: string): Promise<{
  workspace: string;
  version: number;
  mode: string;
  liveHalted?: boolean;
  identity?: ReturnType<typeof serviceIdentity>;
}> {
  return new Promise((resolve, reject) => {
    const client = createConnection(socket);
    let data = "";
    client.setTimeout(3000, () => client.destroy(Error("timeout")));
    client.on("error", reject);
    client.on("connect", () =>
      client.write(JSON.stringify({ method: "list" }) + "\n"),
    );
    client.on("data", (chunk) => {
      data += chunk;
      if (Buffer.byteLength(data) > 1048576) client.destroy(Error("size"));
    });
    client.on("end", () => {
      try {
        const value = JSON.parse(data);
        if (!value.ok || !value.result) throw Error();
        resolve(value.result);
      } catch {
        reject(Error("response"));
      }
    });
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [config, state] = process.argv.slice(2);
  if (!config || !state)
    throw Error("Usage: cursor:doctor <config.json> <state-directory>");
  const report = await diagnose(resolve(config), resolve(state));
  console.log(JSON.stringify(report, null, 2));
  if (report.status === "not-ready") process.exitCode = 1;
}
