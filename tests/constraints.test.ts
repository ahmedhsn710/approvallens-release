import { describe, expect, it } from "vitest";
import { checkConstraints } from "../packages/core/src/evidence/constraints";
import type { JsonEvidenceContext } from "../packages/core/src/evidence/json-changes";
import { parseScope } from "../packages/core/src/scope";
import { pipeline } from "../packages/core/src/pipeline";
import { Request } from "../packages/core/src/contracts";
import { double, review } from "./helpers";
import { createReviewService } from "../packages/mcp/src/core";

const rules = [
  {
    id: "preserve-auth",
    path: "app.config.json",
    kind: "preserve_field" as const,
    field: "authEnabled",
  },
];
const scope = parseScope({
  grants: [{ operation: "write_file", path: "app.config.json" }],
  constraints: rules,
  evidence: [
    {
      path: "app.config.json",
      fields: { "/port": "integer", "/authEnabled": "boolean" },
    },
  ],
});
const context: JsonEvidenceContext = {
  path: "app.config.json",
  before: '{"port":3000,"authEnabled":true}',
  snapshot: { id: "s", manifestHash: "a".repeat(64) },
};
const input = (content: string) =>
  Request.parse({
    taskId: "t",
    developerIntent: "Change the port",
    agentExplanation: "Update app.config.json",
    toolCall: {
      name: "write_file",
      args: { path: "app.config.json", content },
    },
  });

describe("explicit field restrictions", () => {
  it("blocks a forbidden content change despite a favorable model; operation scope remains permitted", async () => {
    const result = await pipeline(
      input('{"port":8080,"authEnabled":false}'),
      scope,
      double(review()),
      context,
    );
    expect(result.review?.intent.alignment).toBe("aligned");
    expect(result.decision).toMatchObject({
      outcome: "block",
      scope: { status: "permitted" },
      reasons: [{ code: "constraint_violation" }],
    });
  });

  it("blocks without any model and permits review of an unchanged protected field", async () => {
    expect(
      (
        await pipeline(
          input('{"port":8080,"authEnabled":false}'),
          scope,
          undefined,
          context,
        )
      ).decision.outcome,
    ).toBe("block");
    expect(
      (
        await pipeline(
          input('{"port":8080,"authEnabled":true}'),
          scope,
          double(review()),
          context,
        )
      ).decision.outcome,
    ).toBe("allow");
  });

  it("does not infer restrictions from natural-language goals", async () => {
    const result = await pipeline(
      input('{"port":8080,"authEnabled":false}'),
      { grants: scope.grants },
      double(review()),
      context,
    );
    expect(result.analysis.effects[0]?.constraintChecks).toBeUndefined();
  });

  it("missing or invalid evidence requires more context, even when the model says aligned", async () => {
    for (const ctx of [undefined, { ...context, path: "other.json" }]) {
      const result = await pipeline(
        input('{"authEnabled":true}'),
        scope,
        double(review()),
        ctx,
      );
      expect(result.decision.reasons[0]?.code).toBe("constraint_unassessed");
      expect(result.decision.outcome).toBe("review");
    }
    expect(checkConstraints("{}", "{", rules)[0]?.status).toBe("unknown");
  });

  it("checks deletions, type changes, and absent versus null", () => {
    for (const after of [
      "{}",
      '{"authEnabled":null}',
      '{"authEnabled":"true"}',
    ]) {
      expect(checkConstraints(context.before, after, rules)[0]?.status).toBe(
        "violated",
      );
    }
    expect(
      checkConstraints("{}", '{"authEnabled":null}', rules)[0]?.status,
    ).toBe("violated");
    expect(checkConstraints("{}", "{}", rules)[0]?.status).toBe("passed");
  });

  it("cannot bypass preservation by deleting the whole file", async () => {
    const result = await pipeline(
      {
        ...input("{}"),
        toolCall: { name: "delete_file", args: { path: context.path } },
      },
      {
        grants: [{ operation: "delete_file", path: context.path }],
        constraints: rules,
        evidence: scope.evidence,
      },
      double(review()),
      context,
    );
    expect(result.decision.outcome).toBe("block");
  });

  it("does not return protected values in constraint results", () => {
    const output = checkConstraints(
      '{"token":"SECRET_ONE"}',
      '{"token":"SECRET_TWO"}',
      [{ ...rules[0]!, field: "token" }],
    );
    expect(output[0]?.status).toBe("violated");
    expect(JSON.stringify(output)).not.toContain("SECRET");
  });

  it("rejects duplicate rule IDs and unknown constraint kinds", () => {
    expect(() =>
      parseScope({ grants: [], constraints: [rules[0], rules[0]] }),
    ).toThrow();
    expect(() =>
      parseScope({
        grants: [],
        constraints: [{ ...rules[0], kind: "allow_anything" }],
      }),
    ).toThrow();
  });

  it("MCP cannot silently drop configured restrictions when it lacks a snapshot", async () => {
    const service = createReviewService({
      version: 1,
      taskId: "t",
      developerIntent: "Change port",
      grants: [...scope.grants],
      constraints: [...rules],
    });
    const result = await service({
      toolCall: input("{}").toolCall,
      agentExplanation: "Update config",
    });
    expect(result.decision.reasons[0]?.code).toBe("constraint_unassessed");
    expect(result.executable).toBe(false);
  });
});
