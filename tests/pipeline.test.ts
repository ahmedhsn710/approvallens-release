import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { analyze } from "../packages/core/src/analyzer";
import { REVIEW_SCHEMA_VERSION } from "../packages/core/src/contracts";
import { nebiusReviewer } from "../packages/core/src/nebius";
import { parseScope, type Scope } from "../packages/core/src/scope";
import {
  decide,
  pipeline,
  POLICY_VERSION,
} from "../packages/core/src/pipeline";
import {
  aligned,
  deleteRequest,
  disclosureUnknown,
  double,
  faithful,
  intentUnknown,
  misaligned,
  misleading,
  omission,
  readRequest,
  review,
  scope,
  shellRequest,
} from "./helpers";

const run = (request: unknown, output: unknown, s = scope) =>
  pipeline(request, s, double(output));

describe("scope authorization is independent of semantic dimensions", () => {
  it("faithful but forbidden: a sensitive read stays blocked and its disclosure stays faithful", async () => {
    const r = await run(
      readRequest(".env.synthetic", "Read .env.synthetic"),
      review(faithful, misaligned),
    );
    expect(r.error).toBeNull();
    expect(r.review?.disclosure).toEqual(faithful);
    expect(r.review?.intent.alignment).toBe("misaligned");
    expect(r.decision.outcome).toBe("block");
    expect(r.decision.scope.status).toBe("denied");
    expect(r.decision.scope.violations).toEqual(
      expect.arrayContaining([
        "Path outside trusted task scope",
        "Sensitive path forbidden",
      ]),
    );
    expect(r.decision.reasons.every((x) => x.source === "policy")).toBe(true);
    expect(r.executable).toBe(false);
  });

  it("hard policy denial wins over a faithful, aligned review", async () => {
    const r = await run(
      readRequest(".env.synthetic", "Read .env.synthetic"),
      review(faithful, aligned),
      { grants: [{ operation: "read_file", path: ".env.synthetic" }] },
    );
    expect(r.decision.outcome).toBe("block");
    expect(r.decision.scope.status).toBe("denied");
    expect(r.decision.scope.violations).toEqual(["Sensitive path forbidden"]);
  });

  it("keeps denial identical whatever the model says about intent", async () => {
    const request = readRequest(".env.synthetic", "Read .env.synthetic");
    const outputs = [
      review(faithful, aligned),
      review(faithful, misaligned),
      review(faithful, intentUnknown),
    ];
    const decisions = await Promise.all(
      outputs.map(async (o) => (await run(request, o)).decision),
    );
    expect(new Set(decisions.map((d) => JSON.stringify(d))).size).toBe(1);
  });

  it("blocks a denied operation even without any review", async () => {
    const r = await pipeline(readRequest("../secret"), {
      grants: [{ operation: "read_file", path: "package.json" }],
    });
    expect(r.decision.outcome).toBe("block");
    expect(r.decision.scope.status).toBe("denied");
  });
});

describe("intent alignment does not rewrite disclosure", () => {
  const inScope: Scope = {
    grants: [
      { operation: "read_file", path: "package.json" },
      { operation: "read_file", path: "notes.txt" },
    ],
  };
  const notesRead = () => readRequest("notes.txt", "Read notes.txt");

  it("faithful but intent-misaligned: permitted scope, review required, never allow", async () => {
    const r = await run(notesRead(), review(faithful, misaligned), inScope);
    expect(r.error).toBeNull();
    expect(r.decision.scope.status).toBe("permitted");
    expect(r.decision.outcome).toBe("review");
    expect(r.decision.reasons.map((x) => x.code)).toEqual([
      "intent_misaligned",
    ]);
    expect(r.review?.disclosure).toEqual(faithful);
    expect(r.executable).toBe(false);
  });

  it("misaligned intent does not manufacture a disclosure reason", async () => {
    const r = await run(notesRead(), review(faithful, misaligned), inScope);
    expect(r.decision.reasons.some((x) => x.source === "disclosure")).toBe(
      false,
    );
  });

  it("unknown intent with faithful disclosure requires non-executable review", async () => {
    const r = await run(notesRead(), review(faithful, intentUnknown), inScope);
    expect(r.decision.outcome).toBe("review");
    expect(r.decision.reasons.map((x) => x.code)).toEqual(["intent_unknown"]);
    expect(r.decision.scope.status).toBe("permitted");
  });

  it("misaligned intent cannot be used to grant scope for a path outside it", async () => {
    const r = await run(notesRead(), review(faithful, aligned), scope);
    expect(r.decision.scope.status).toBe("denied");
    expect(r.decision.outcome).toBe("block");
  });

  it("a different intent judgment leaves the disclosure object byte-identical", async () => {
    const a = await run(notesRead(), review(faithful, aligned), inScope);
    const b = await run(notesRead(), review(faithful, misaligned), inScope);
    expect(JSON.stringify(a.review?.disclosure)).toBe(
      JSON.stringify(b.review?.disclosure),
    );
  });
});

describe("disclosure findings drive their own outcome", () => {
  it("misleading but permitted low-risk action requires review with a disclosure reason", async () => {
    const r = await run(
      readRequest("package.json", "Read README.md"),
      review(misleading, aligned),
    );
    expect(r.decision.scope.status).toBe("permitted");
    expect(r.decision.outcome).toBe("review");
    expect(r.decision.reasons.map((x) => x.code)).toEqual([
      "disclosure_misleading",
    ]);
    expect(r.review?.intent.alignment).toBe("aligned");
  });

  it("misleading high-risk permitted action blocks, while scope stays permitted", async () => {
    const r = await run(
      deleteRequest("obsolete.txt", "Read obsolete.txt"),
      review(omission, aligned),
      { grants: [{ operation: "delete_file", path: "obsolete.txt" }] },
    );
    expect(r.decision.scope.status).toBe("permitted");
    expect(r.decision.outcome).toBe("block");
    expect(r.decision.reasons.map((x) => x.code)).toEqual([
      "disclosure_misleading",
    ]);
  });

  it("records both reasons when disclosure and intent each need attention", async () => {
    const r = await run(readRequest(), review(misleading, misaligned));
    expect(r.decision.outcome).toBe("review");
    expect(r.decision.reasons.map((x) => x.code)).toEqual([
      "disclosure_misleading",
      "intent_misaligned",
    ]);
  });

  it("unknown disclosure requires review", async () => {
    const r = await run(readRequest(), review(disclosureUnknown, aligned));
    expect(r.decision.outcome).toBe("review");
    expect(r.decision.reasons.map((x) => x.code)).toEqual([
      "disclosure_unknown",
    ]);
  });
});

describe("allow requires every dimension, and is never an authorization", () => {
  it("faithful, aligned, in-scope, low-risk is allow but not executable", async () => {
    const r = await run(readRequest(), review(faithful, aligned));
    expect(r.decision.outcome).toBe("allow");
    expect(r.executable).toBe(false);
  });

  it("high-risk but permitted and well disclosed still needs human review", async () => {
    const r = await run(deleteRequest(), review(faithful, aligned), {
      grants: [{ operation: "delete_file", path: "obsolete.txt" }],
    });
    expect(r.decision.outcome).toBe("review");
    expect(r.decision.reasons.map((x) => x.code)).toEqual(["high_risk"]);
  });

  it("is pure: decide() does not mutate the review it reads", () => {
    const analysis = analyze(readRequest(), scope);
    const input = structuredClone(review(faithful, misaligned)) as never;
    const before = JSON.stringify(input);
    decide(analysis, input);
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe("unknown shell", () => {
  it("stays non-executable review with unknown in both dimensions", async () => {
    const r = await run(shellRequest, review(disclosureUnknown, intentUnknown));
    expect(r.error).toBeNull();
    expect(r.analysis.coverage).toBe("unknown");
    expect(r.decision.outcome).toBe("review");
    expect(r.decision.scope.status).toBe("unassessed");
    expect(r.decision.reasons.map((x) => x.code)).toEqual([
      "coverage_unknown",
      "disclosure_unknown",
      "intent_unknown",
    ]);
    expect(r.executable).toBe(false);
  });

  it.each([
    ["faithful and aligned", review(faithful, aligned)],
    [
      "unknown disclosure but aligned intent",
      review(disclosureUnknown, aligned),
    ],
    ["faithful disclosure but unknown intent", review(faithful, intentUnknown)],
  ])("rejects overconfident output for shell: %s", async (_name, output) => {
    const r = await run(shellRequest, output);
    expect(r.review).toBeNull();
    expect(r.errorCategory).toBe("invalid_review");
    expect(r.decision.outcome).toBe("review");
    expect(r.executable).toBe(false);
  });
});

describe("invalid evidence references fail the whole review", () => {
  it.each([
    ["disclosure misrepresentation", review(misleading, aligned)],
    ["disclosure omission", review(omission, aligned)],
    ["intent finding", review(faithful, misaligned)],
  ])("%s", async (_name, output) => {
    const r = await run(
      readRequest(),
      JSON.parse(JSON.stringify(output).replaceAll('"e1"', '"e404"')),
    );
    expect(r.review).toBeNull();
    expect(r.errorCategory).toBe("invalid_review");
    expect(r.decision.outcome).toBe("review");
    expect(r.decision.reasons.map((x) => x.code)).toEqual([
      "review_unavailable",
    ]);
  });
});

describe("malformed output and provider failure fail closed", () => {
  it.each([
    ["null", null],
    ["text", "faithful"],
    ["empty object", {}],
    [
      "legacy v1 shape",
      { fidelity: "faithful", findings: [], unresolvedQuestions: [] },
    ],
    [
      "intent_mismatch disclosure finding",
      review({
        ...misleading,
        findings: [{ ...misleading.findings[0], type: "intent_mismatch" }],
      }),
    ],
  ])(
    "rejects %s as invalid_review and keeps the model name and usage",
    async (_name, output) => {
      const reviewer = Object.assign(
        async () => ({
          output,
          model: "test-double",
          usage: { total_tokens: 3 },
        }),
        {
          promptVersion: "test-prompt",
        },
      );
      const r = await pipeline(readRequest(), scope, reviewer);
      expect(r.review).toBeNull();
      expect(r.errorCategory).toBe("invalid_review");
      expect(r.model).toBe("test-double");
      expect(r.usage).toEqual({ total_tokens: 3 });
      expect(r.decision.outcome).toBe("review");
      expect(r.executable).toBe(false);
    },
  );

  it("reports a provider failure without leaking its message", async () => {
    const r = await pipeline(readRequest(), scope, async () => {
      throw new Error("secret provider response");
    });
    expect(r.errorCategory).toBe("reviewer_failed");
    expect(r.error).not.toContain("secret");
    expect(JSON.stringify(r)).not.toContain("secret provider response");
    expect(r.review).toBeNull();
    expect(r.decision.outcome).toBe("review");
    expect(r.executable).toBe(false);
  });

  it("does not let a failed reviewer relax a hard denial", async () => {
    const r = await pipeline(readRequest(".env.synthetic"), scope, async () => {
      throw new Error("down");
    });
    expect(r.decision.outcome).toBe("block");
  });
});

describe("reports carry versions", () => {
  it("records schema, prompt, analyzer and policy versions", async () => {
    const r = await run(readRequest(), review());
    expect(r.versions).toEqual({
      reviewSchema: REVIEW_SCHEMA_VERSION,
      prompt: "test-prompt",
      analyzer: "evidence-analyzers-v7",
      scope: "policy-evidence-v5",
      policy: POLICY_VERSION,
    });
  });

  it("keeps the prompt version in reports even when the provider call fails", async () => {
    const failing = Object.assign(
      async () => {
        throw new Error("x");
      },
      { promptVersion: "test-prompt" },
    );
    expect(
      (await pipeline(readRequest(), scope, failing)).versions.prompt,
    ).toBe("test-prompt");
  });

  it("has no prompt version and no semantic review in rules-only mode", async () => {
    const r = await pipeline(readRequest(), scope);
    expect(r.review).toBeNull();
    expect(r.versions.prompt).toBeNull();
    expect(r.versions.reviewSchema).toBe(REVIEW_SCHEMA_VERSION);
    expect(r.mode).toBe("rules-only");
  });
});

describe("fixtures and configuration", () => {
  it("runs all 12 unchanged development fixtures through the pipeline without execution", async () => {
    const lines = (await readFile("fixtures/development.jsonl", "utf8"))
      .trim()
      .split("\n");
    expect(lines).toHaveLength(12);
    const expected = lines.map((line) => JSON.parse(line).expected as string);
    expect(expected.filter((e) => e === "faithful")).toHaveLength(5);
    expect(expected.filter((e) => e === "misleading")).toHaveLength(5);
    expect(expected.filter((e) => e === "unknown")).toHaveLength(2);
    for (const line of lines) {
      const c = JSON.parse(line);
      expect(
        (await pipeline(c.request, parseScope({ grants: c.grants })))
          .executable,
      ).toBe(false);
    }
  });

  it("refuses missing live configuration", () => {
    const old = process.env.NEBIUS_API_KEY;
    delete process.env.NEBIUS_API_KEY;
    try {
      expect(() => nebiusReviewer("grounded")).toThrow("Set NEBIUS_API_KEY");
    } finally {
      if (old !== undefined) process.env.NEBIUS_API_KEY = old;
    }
  });
});
