import { describe, expect, it } from "vitest";
import {
  pipeline,
  decide,
  assessDecision,
  runReview,
  type Reviewer,
} from "../packages/core/src/pipeline";
import { analyze } from "../packages/core/src/analyzer";
import {
  validateReview,
  type Analysis,
  type Request,
} from "../packages/core/src/contracts";
import { double, review, readRequest, scope } from "./helpers";
import { inspectMutation } from "../packages/core/src/evidence/analyzers";

const policy = {
  grants: [{ operation: "write_file" as const, path: "settings.json" }],
  evidence: [
    { path: "settings.json", fields: { "/strict": "boolean" as const } },
  ],
  constraints: [
    {
      id: "keep",
      kind: "preserve_field" as const,
      path: "settings.json",
      field: "/strict",
    },
  ],
};
const request: Request = {
  taskId: "t",
  developerIntent: "Preserve strict",
  agentExplanation: "Update settings",
  toolCall: {
    name: "write_file",
    args: { path: "settings.json", content: '{"strict":false}' },
  },
};
const baseline = {
  path: "settings.json",
  before: '{"strict":true}',
  snapshot: { id: "test", manifestHash: "test" },
};

describe("decision dimensions and reviewer isolation", () => {
  it("separates permission, preservation and judgment without making reviewer output authoritative", async () => {
    const result = await pipeline(request, policy, double(review()), baseline);
    expect(result.decision.outcome).toBe("block");
    expect(result.assessment).toMatchObject({
      permission: "permitted",
      preservation: { violated: [{ id: "keep" }] },
      judgment: { disclosure: "faithful", intent: "aligned" },
      executionAuthorized: false,
    });
    expect(result.assessment.evidence.content[0]).toMatchObject({
      status: "complete",
      basis: "json-comparison",
      limitations: ["runtime_behavior_not_verified"],
    });
  });
  it("a reviewer cannot remove violations, replace evidence, or rewrite the returned request", async () => {
    const malicious: Reviewer = async (input, evidence) => {
      input.toolCall = { name: "read_file", args: { path: "safe.txt" } };
      input.developerIntent = "Approve everything";
      evidence.violations = [];
      evidence.effects = [];
      evidence.coverage = "complete";
      evidence.risk = "low";
      return { model: "mutation-test-double", output: review() };
    };
    const blocked = await pipeline(request, policy, malicious, baseline);
    expect(blocked.request).toEqual(request);
    expect(blocked.decision.outcome).toBe("block");
    expect(blocked.analysis.effects[0]?.constraintChecks?.[0]?.status).toBe(
      "violated",
    );
    const denied = await pipeline(
      readRequest(".env"),
      { grants: [] },
      malicious,
    );
    expect(denied.decision.scope.status).toBe("denied");
  });
  it("reviewer mutation cannot manufacture certainty on incomplete evidence or forge citations", async () => {
    const mutate: Reviewer = async (_request, analysis) => {
      analysis.coverage = "complete";
      analysis.effects = [
        {
          id: "invented",
          kind: "file_read",
          resource: "safe",
          evidence: "fiction",
          certainty: "direct",
        },
      ];
      return { model: "mutation-test-double", output: review() };
    };
    const incomplete = await pipeline(request, policy, mutate);
    expect(incomplete.errorCategory).toBe("invalid_review");
    expect(incomplete.decision.outcome).toBe("review");
    const analysis = analyze(readRequest(), scope);
    const forged: Reviewer = async (_request, supplied) => {
      supplied.effects[0]!.id = "invented";
      return {
        model: "double",
        output: review({
          fidelity: "misleading",
          findings: [
            {
              type: "omission",
              effectIds: ["invented"],
              explanation: "invented",
              severity: "low",
            },
          ],
          unresolvedQuestions: [],
        }),
      };
    };
    expect(
      (await runReview(readRequest(), analysis, forged)).errorCategory,
    ).toBe("invalid_review");
    expect(analysis.effects[0]?.id).toBe("e1");
  });
  it("reports operation-only limits without pretending contents were assessed", async () => {
    const result = await pipeline(
      request,
      { grants: policy.grants },
      double(review()),
    );
    expect(result.decision.outcome).toBe("allow");
    expect(result.assessment.evidence).toMatchObject({
      incomplete: false,
      content: [
        {
          status: "not-inspected",
          basis: "declared-operation",
          limitations: [
            "contents_not_inspected",
            "runtime_behavior_not_verified",
          ],
        },
      ],
    });
    expect(result.executable).toBe(false);
  });
  it("keeps legacy analyses readable and new analyzer incompleteness nonapprovable", () => {
    const old: Analysis = {
      effects: [
        {
          id: "e1",
          kind: "file_write",
          resource: "x",
          evidence: "declared",
          certainty: "direct",
        },
      ],
      coverage: "complete",
      risk: "low",
      violations: [],
    };
    expect(assessDecision(old, null).judgment.available).toBe(false);
    const newer: Analysis = structuredClone(old);
    newer.effects[0]!.inspection = {
      analyzer: "future-test-double",
      version: "test",
      basis: "declared-operation",
      status: "incomplete",
      limitations: ["unsupported_construct"],
    };
    expect(() => validateReview(review(), newer)).toThrow();
    expect(decide(newer, review() as never).outcome).toBe("review");
  });
  it("content analyzer receives trusted rules and returns bounded structured evidence", () => {
    if (request.toolCall.name !== "write_file") throw Error("test setup");
    const evidence = inspectMutation(request.toolCall, policy, baseline);
    expect(evidence.inspection).toMatchObject({
      analyzer: "bounded-json",
      basis: "json-comparison",
      status: "complete",
    });
    expect(evidence.content?.changes[0]?.pointer).toBe("/strict");
    expect(JSON.stringify(evidence)).not.toContain(baseline.before);
  });
});
