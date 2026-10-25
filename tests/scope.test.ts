import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { analyze } from "../packages/core/src/analyzer";
import { Request } from "../packages/core/src/contracts";
import { pipeline } from "../packages/core/src/pipeline";
import {
  SCOPE_VERSION,
  isNormalizedRelativePath,
  matchGrant,
  parseScope,
  type Scope,
} from "../packages/core/src/scope";
import {
  aligned,
  deleteRequest,
  double,
  faithful,
  readRequest,
  review,
} from "./helpers";

const tool = (name: "read_file" | "write_file" | "delete_file", path: string) =>
  Request.parse({
    taskId: "t",
    developerIntent: "Work on a file",
    agentExplanation: "Explanation",
    toolCall:
      name === "write_file"
        ? { name, args: { path, content: "x" } }
        : { name, args: { path } },
  });

const readOnly: Scope = {
  grants: [{ operation: "read_file", path: "src/config.json" }],
};

describe("policy-evidence-v5 scope", () => {
  it("is explicitly versioned", () => {
    expect(SCOPE_VERSION).toBe("policy-evidence-v5");
  });

  it("read permission permits only reading", () => {
    expect(
      analyze(tool("read_file", "src/config.json"), readOnly).violations,
    ).toEqual([]);
    expect(
      analyze(tool("write_file", "src/config.json"), readOnly).violations,
    ).toEqual(["Operation not granted for this path"]);
    expect(
      analyze(tool("delete_file", "src/config.json"), readOnly).violations,
    ).toEqual(["Operation not granted for this path"]);
  });

  it("write permission does not imply read or delete", () => {
    const writeOnly: Scope = {
      grants: [{ operation: "write_file", path: "a.txt" }],
    };
    expect(analyze(tool("write_file", "a.txt"), writeOnly).violations).toEqual(
      [],
    );
    expect(
      analyze(tool("read_file", "a.txt"), writeOnly).violations,
    ).not.toEqual([]);
    expect(
      analyze(tool("delete_file", "a.txt"), writeOnly).violations,
    ).not.toEqual([]);
  });

  it('separates "operation not granted" from "path outside scope"', () => {
    expect(matchGrant(readOnly, "write_file", "src/config.json")).toBe(
      "operation_not_granted",
    );
    expect(matchGrant(readOnly, "read_file", "src/other.json")).toBe(
      "path_not_granted",
    );
    expect(matchGrant(readOnly, "read_file", "src/config.json")).toBe(
      "granted",
    );
  });

  it("matches exact paths only: no directory prefixes, case folding or siblings", () => {
    const dir: Scope = { grants: [{ operation: "read_file", path: "src" }] };
    for (const p of ["src/a.ts", "SRC", "src2", "src/"]) {
      expect(matchGrant(dir, "read_file", p)).toBe("path_not_granted");
    }
    expect(
      analyze(tool("read_file", "SRC/CONFIG.JSON"), readOnly).violations,
    ).toContain("Path outside trusted task scope");
  });

  it("keeps a sensitive path denied even when it is explicitly granted", () => {
    const granted: Scope = {
      grants: [{ operation: "read_file", path: ".env.synthetic" }],
    };
    expect(
      analyze(tool("read_file", ".env.synthetic"), granted).violations,
    ).toEqual(["Sensitive path forbidden"]);
  });

  it("never grants shell: no grant shape exists and shell has no violations to authorize", () => {
    expect(() =>
      parseScope({ grants: [{ operation: "shell", path: "x" }] }),
    ).toThrow();
    const shell = Request.parse({
      taskId: "t",
      developerIntent: "Fix",
      agentExplanation: "Run",
      toolCall: { name: "shell", args: { command: "ls" } },
    });
    const broad: Scope = {
      grants: [{ operation: "read_file", path: "package.json" }],
    };
    expect(analyze(shell, broad).coverage).toBe("unknown");
  });

  it("rejects invalid grant data instead of trusting it", () => {
    for (const path of [
      "",
      "/etc/passwd",
      "../x",
      "a/../b",
      "./a",
      "a//b",
      "a/",
      "a\\b",
      "C:/x",
      "a\nb",
      ".",
    ]) {
      expect(isNormalizedRelativePath(path), JSON.stringify(path)).toBe(false);
      expect(() =>
        parseScope({ grants: [{ operation: "read_file", path }] }),
      ).toThrow();
    }
    expect(() =>
      parseScope({ grants: [{ operation: "read_file", path: "a", extra: 1 }] }),
    ).toThrow();
    expect(() => parseScope({ allowedPaths: ["a"] })).toThrow();
    expect(
      parseScope({ grants: [{ operation: "read_file", path: "a/b.txt" }] })
        .grants,
    ).toHaveLength(1);
  });

  it("a read-only scope blocks a faithful, aligned delete and the review cannot change that", async () => {
    const scope: Scope = {
      grants: [{ operation: "read_file", path: "obsolete.txt" }],
    };
    const r = await pipeline(
      deleteRequest(),
      scope,
      double(review(faithful, aligned)),
    );
    expect(r.decision.outcome).toBe("block");
    expect(r.decision.scope).toEqual({
      status: "denied",
      violations: ["Operation not granted for this path"],
    });
    expect(r.review?.disclosure).toEqual(faithful);
    expect(r.executable).toBe(false);
  });

  it("records the scope version in reports", async () => {
    expect(
      (await pipeline(readRequest(), parseScope({ grants: [] }))).versions
        .scope,
    ).toBe("policy-evidence-v5");
  });
});

describe("fixture metadata migration", () => {
  it("uses grants that match each proposed operation and keeps the original labels and requests", async () => {
    const lines = (await readFile("fixtures/development.jsonl", "utf8"))
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(lines).toHaveLength(12);
    for (const c of lines) {
      expect(c).not.toHaveProperty("allowedPaths");
      const scope = parseScope({ grants: c.grants });
      const t = c.request.toolCall;
      if (t.name === "shell") expect(scope.grants).toEqual([]);
      else if (c.family === "secret") {
        // Intent named package.json; the proposal reads a different, forbidden file.
        expect(scope.grants).toEqual([
          { operation: "read_file", path: "package.json" },
        ]);
        expect(t.args.path).toBe(".env.synthetic");
      } else
        expect(scope.grants).toEqual([
          { operation: t.name, path: t.args.path },
        ]);
    }
    const labels = Object.fromEntries(lines.map((c) => [c.id, c.expected]));
    expect(Object.values(labels).filter((l) => l === "faithful")).toHaveLength(
      5,
    );
    expect(labels["secret-faithful"]).toBe("faithful");
  });
});
