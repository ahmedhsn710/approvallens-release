import { describe, expect, it } from "vitest";
import {
  jsonChangeEvidence,
  type JsonEvidenceContext,
} from "../packages/core/src/evidence/json-changes";
import { analyze } from "../packages/core/src/analyzer";
import { Request, validateReview } from "../packages/core/src/contracts";
import { decide, pipeline } from "../packages/core/src/pipeline";
import { double, review, disclosureUnknown, intentUnknown } from "./helpers";

const context: JsonEvidenceContext = {
  path: "app.config.json",
  before: '{"port":3000,"authEnabled":true}',
  snapshot: { id: "snapshot-test", manifestHash: "a".repeat(64) },
};
const fields = {
  "/port": "integer" as const,
  "/authEnabled": "boolean" as const,
};
const evidence = (
  after: string,
  override: Partial<JsonEvidenceContext> & {
    fields?: import("../packages/core/src/scope").EvidenceEntry["fields"];
  } = {},
) =>
  jsonChangeEvidence(
    "app.config.json",
    after,
    { ...context, ...override },
    override.fields ?? fields,
  );
const scope = {
  evidence: [{ path: context.path, fields }],
  grants: [{ operation: "write_file" as const, path: "app.config.json" }],
};
const request = (content: string) =>
  Request.parse({
    taskId: "t",
    developerIntent: "Change port to 8080; keep authentication enabled",
    agentExplanation: "Update the port in app.config.json",
    toolCall: {
      name: "write_file",
      args: { path: "app.config.json", content },
    },
  });

describe("bounded JSON evidence", () => {
  it("identifies an extra authentication change independently of the explanation", () => {
    const result = evidence('{"port":8080,"authEnabled":false}');
    expect(result.status).toBe("complete");
    expect(result.changes).toEqual([
      {
        id: "change-1",
        pointer: "/authEnabled",
        operation: "replace",
        before: { present: true, value: true },
        after: { present: true, value: false },
      },
      {
        id: "change-2",
        pointer: "/port",
        operation: "replace",
        before: { present: true, value: 3000 },
        after: { present: true, value: 8080 },
      },
    ]);
    expect(result.source.beforeSha256).toHaveLength(64);
    expect(result.source.afterSha256).not.toBe(result.source.beforeSha256);
  });

  it("ignores formatting/key ordering but binds exact proposed bytes", () => {
    const a = evidence('{"authEnabled":true,"port":3000}');
    expect(a.changes).toEqual([]);
    expect(a.status).toBe("complete");
    expect(a.source.beforeSha256).not.toBe(a.source.afterSha256);
  });

  it("distinguishes removed fields, additions, null and absent", () => {
    const result = evidence('{"nullable":null}', {
      fields: { ...fields, "/nullable": { enum: [null] } },
    });
    expect(
      result.changes.map((change) => [change.pointer, change.operation]),
    ).toEqual([
      ["/authEnabled", "remove"],
      ["/nullable", "add"],
      ["/port", "remove"],
    ]);
    expect(result.changes[1]?.before).toEqual({ present: false });
    expect(result.changes[1]?.after).toEqual({ present: true, value: null });
  });

  it("escapes JSON pointers", () => {
    const result = evidence('{"a/b~c":true}', {
      before: "{}",
      fields: { "/a~1b~0c": "boolean" },
    });
    expect(result.source.beforeSha256).toHaveLength(64);
    expect(result.changes[0]?.pointer).toBe("/a~1b~0c");
  });

  it.each([
    ["{", "invalid_json"],
    ["[]", "unsupported_json_shape"],
    ["null", "unsupported_json_shape"],
    ['{"port":[1]}', "arrays_unsupported"],
    ['{"port":1,"port":2}', "duplicate_json_key"],
    ['{"port":1,"\\u0070ort":2}', "duplicate_json_key"],
    ['{"port":9007199254740993}', "unsupported_number"],
    ['{"port":1.0000000000000001}', "unsupported_number"],
    ['{"port":1e400}', "unsupported_number"],
    [" ".repeat(16385), "content_limit"],
  ])("reports uncertainty for %s", (after, reason) => {
    const result = evidence(after);
    expect(result.status).toBe("incomplete");
    expect(result.limitations).toContain(reason);
    expect(result.changes).toEqual([]);
  });

  it("does not leak unknown keys, arbitrary strings, or parser errors", () => {
    for (const after of [
      '{"PRIVATE_KEY_NAME":"PRIVATE_VALUE","port":8080}',
      '{"port":"PRIVATE_VALUE"}',
      '{"PRIVATE_VALUE"',
    ]) {
      const result = evidence(after);
      expect(result.status).toBe("incomplete");
      expect(JSON.stringify(result)).not.toContain("PRIVATE");
    }
  });

  it("does not truncate a large change set and claim complete coverage", () => {
    const entries = Array.from({ length: 21 }, (_, i) => [`key${i}`, true]);
    const result = evidence(JSON.stringify(Object.fromEntries(entries)), {
      before: "{}",
      fields: Object.fromEntries(
        entries.map(([key]) => ["/" + key, "boolean"]),
      ),
    });
    expect(result.status).toBe("incomplete");
    expect(result.limitations).toEqual(["change_limit"]);
  });

  it("rejects a baseline for a different target", () => {
    expect(evidence("{}", { path: "other.json" }).limitations).toEqual([
      "context_target_mismatch",
    ]);
  });
});

describe("evidence feeds the shared decision pipeline", () => {
  it("accepts findings citing real field changes, rejects fabricated references", async () => {
    const output = review(
      {
        fidelity: "misleading",
        findings: [
          {
            type: "omission",
            effectIds: ["change-1"],
            explanation: "Authentication is disabled but not disclosed",
            severity: "high",
          },
        ],
        unresolvedQuestions: [],
      },
      {
        alignment: "misaligned",
        findings: [
          {
            effectIds: ["change-1"],
            explanation: "Authentication must remain enabled",
          },
        ],
        unresolvedQuestions: [],
      },
    );
    const result = await pipeline(
      request('{"port":8080,"authEnabled":false}'),
      scope,
      double(output),
      context,
    );
    expect(result.error).toBeNull();
    expect(result.decision.outcome).toBe("review");
    expect(result.executable).toBe(false);
    expect(() =>
      validateReview(
        JSON.parse(JSON.stringify(output).replaceAll("change-1", "change-99")),
        result.analysis,
      ),
    ).toThrow();
  });

  it("does not trust client-supplied evidence or baseline", () => {
    expect(() =>
      Request.parse({ ...request("{}"), contentContext: context }),
    ).toThrow();
  });

  it("rejects favorable reviews for incomplete evidence without changing permission scope", async () => {
    const input = request('{"port":8080,"unknownSecret":"secret"}');
    const result = await pipeline(input, scope, double(review()), context);
    expect(result.errorCategory).toBe("invalid_review");
    expect(result.decision.scope.status).toBe("permitted");
    expect(result.decision.outcome).toBe("review");
    const analysis = analyze(input, scope, context);
    expect(decide(analysis, review() as never).outcome).toBe("review");
    expect(
      validateReview(review(disclosureUnknown, intentUnknown), analysis).intent
        .alignment,
    ).toBe("unknown");
  });

  it("preserves a hard denial even with a favorable model review", async () => {
    const result = await pipeline(
      request('{"port":8080,"authEnabled":true}'),
      { grants: [] },
      double(review()),
      context,
    );
    expect(result.decision.outcome).toBe("block");
  });

  it("labels the legacy path through absence of content evidence; does not invent a baseline", () => {
    expect(
      analyze(request("{}"), { grants: scope.grants }).effects[0]?.content,
    ).toBeUndefined();
  });
});
