import { describe, expect, it } from "vitest";
import { analyze } from "../packages/core/src/analyzer";
import {
  REVIEW_SCHEMA_VERSION,
  Request,
  validateReview,
} from "../packages/core/src/contracts";
import {
  PROMPT_VERSION,
  REVIEW_SCHEMA_NAME,
  buildSystemPrompt,
  reviewJsonSchema,
} from "../packages/core/src/prompt";
import {
  aligned,
  disclosureUnknown,
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

const fileAnalysis = analyze(readRequest(), scope);
const shellAnalysis = analyze(shellRequest, scope);
const validate = (raw: unknown) => validateReview(raw, fileAnalysis);

describe("versions and schema shape", () => {
  it("exposes versions and a provider-safe schema name", () => {
    expect(REVIEW_SCHEMA_VERSION).toBe("approvallens.review.v2");
    expect(PROMPT_VERSION).toBe("approvallens.prompt.v9");
    expect(REVIEW_SCHEMA_NAME).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("no longer lets disclosure report intent mismatch", () => {
    const schema = JSON.stringify(reviewJsonSchema());
    expect(schema).not.toContain("intent_mismatch");
    expect(schema).toContain("misaligned");
    expect(() =>
      validate(
        review({
          ...misleading,
          findings: [{ ...misleading.findings[0], type: "intent_mismatch" }],
        }),
      ),
    ).toThrow();
  });

  it("is strict at every object level", () => {
    const schema = reviewJsonSchema() as {
      additionalProperties?: boolean;
      required?: string[];
    };
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(["disclosure", "intent"]);
    const objects =
      JSON.stringify(schema).match(/"additionalProperties":false/g) ?? [];
    expect(objects.length).toBeGreaterThanOrEqual(5); // review, disclosure, intent, two finding types
  });

  it("puts the same schema and version in the system prompt for every mode", () => {
    const prompt = buildSystemPrompt(reviewJsonSchema());
    expect(prompt).toContain(REVIEW_SCHEMA_VERSION);
    expect(prompt).toContain(
      "even if the operation conflicts with developerIntent",
    );
  });

  it("rejects untrusted extra properties on requests", () => {
    expect(() => Request.parse({ ...readRequest(), approved: true })).toThrow();
  });
});

describe("structural validation", () => {
  it.each([
    ["faithful and aligned", review(faithful, aligned)],
    ["misleading and aligned", review(misleading, aligned)],
    ["faithful and misaligned", review(faithful, misaligned)],
    ["omission finding", review(omission, aligned)],
    [
      "unknown disclosure with aligned intent",
      review(disclosureUnknown, aligned),
    ],
    ["faithful with unknown intent", review(faithful, intentUnknown)],
  ])("accepts a consistent review: %s", (_name, output) => {
    expect(validate(output)).toEqual(output);
  });

  it("keeps disclosure untouched by a misaligned intent", () => {
    const result = validate(review(faithful, misaligned));
    expect(result.disclosure).toEqual(faithful);
    expect(result.intent.alignment).toBe("misaligned");
  });

  it.each([
    ["disclosure misrepresentation", review(misleading, aligned)],
    ["disclosure omission", review(omission, aligned)],
    ["intent finding", review(faithful, misaligned)],
  ])("rejects an invented evidence ID in %s", (_name, output) => {
    const text = JSON.stringify(output).replaceAll('"e1"', '"invented"');
    expect(() => validate(JSON.parse(text))).toThrow(
      "Invalid evidence reference",
    );
  });

  it("names the failing dimension for invalid references", () => {
    const bad = review(faithful, {
      ...misaligned,
      findings: [{ ...misaligned.findings[0], effectIds: ["e9"] }],
    });
    expect(() => validate(bad)).toThrow("in intent");
    const badDisclosure = review(
      {
        ...misleading,
        findings: [{ ...misleading.findings[0], effectIds: ["e9"] }],
      },
      aligned,
    );
    expect(() => validate(badDisclosure)).toThrow("in disclosure");
  });

  it("rejects a finding with an empty or one invalid ID among valid ones", () => {
    expect(() =>
      validate(
        review({
          ...misleading,
          findings: [{ ...misleading.findings[0], effectIds: [] }],
        }),
      ),
    ).toThrow();
    expect(() =>
      validate(
        review({
          ...misleading,
          findings: [{ ...misleading.findings[0], effectIds: ["e1", "zzz"] }],
        }),
      ),
    ).toThrow("Invalid evidence reference");
  });

  it.each([
    [
      "faithful with findings",
      review({ ...faithful, findings: misleading.findings }),
    ],
    [
      "faithful with questions",
      review({ ...faithful, unresolvedQuestions: ["?"] }),
    ],
    ["misleading without findings", review({ ...misleading, findings: [] })],
    [
      "unknown disclosure without questions",
      review({ ...disclosureUnknown, unresolvedQuestions: [] }),
    ],
    [
      "unknown disclosure with findings",
      review({ ...disclosureUnknown, findings: misleading.findings }),
    ],
    [
      "aligned with findings",
      review(faithful, { ...aligned, findings: misaligned.findings }),
    ],
    [
      "aligned with questions",
      review(faithful, { ...aligned, unresolvedQuestions: ["?"] }),
    ],
    [
      "misaligned without findings",
      review(faithful, { ...misaligned, findings: [] }),
    ],
    [
      "unknown intent without questions",
      review(faithful, { ...intentUnknown, unresolvedQuestions: [] }),
    ],
    [
      "unknown intent with findings",
      review(faithful, { ...intentUnknown, findings: misaligned.findings }),
    ],
  ])("rejects contradictory output: %s", (_name, output) => {
    expect(() => validate(output)).toThrow();
  });

  it.each([
    [
      "legacy v1 shape",
      { fidelity: "faithful", findings: [], unresolvedQuestions: [] },
    ],
    ["missing intent", { disclosure: faithful }],
    ["missing disclosure", { intent: aligned }],
    [
      "model-supplied schemaVersion",
      { ...review(), schemaVersion: REVIEW_SCHEMA_VERSION },
    ],
    [
      "extra field in disclosure",
      { disclosure: { ...faithful, confidence: 1 }, intent: aligned },
    ],
    [
      "extra field in intent finding",
      review(faithful, {
        ...misaligned,
        findings: [{ ...misaligned.findings[0], severity: "low" }],
      }),
    ],
    ["unknown enum value", review({ ...faithful, fidelity: "safe" })],
    ["null", null],
    ["string", "faithful"],
    ["empty object", {}],
  ])("rejects incomplete or malformed output: %s", (_name, output) => {
    expect(() => validate(output)).toThrow();
  });

  it("bounds explanations and finding counts", () => {
    const long = { ...misaligned.findings[0], explanation: "x".repeat(1001) };
    expect(() =>
      validate(review(faithful, { ...misaligned, findings: [long] })),
    ).toThrow();
    const many = Array.from({ length: 11 }, () => misaligned.findings[0]);
    expect(() =>
      validate(review(faithful, { ...misaligned, findings: many })),
    ).toThrow();
  });
});

describe("unknown coverage is conservative", () => {
  it("accepts unknown in both dimensions for shell", () => {
    expect(
      validateReview(review(disclosureUnknown, intentUnknown), shellAnalysis)
        .intent.alignment,
    ).toBe("unknown");
  });

  it.each([
    ["faithful disclosure", review(faithful, intentUnknown)],
    ["misleading disclosure", review(misleading, intentUnknown)],
    ["aligned intent", review(disclosureUnknown, aligned)],
    ["misaligned intent", review(disclosureUnknown, misaligned)],
    ["faithful and aligned", review(faithful, aligned)],
  ])("rejects %s for shell", (_name, output) => {
    expect(() => validateReview(output, shellAnalysis)).toThrow(
      "unknown coverage",
    );
  });

  it("treats an invalid lexical path as unknown coverage", () => {
    const analysis = analyze(readRequest("../secret"), {
      grants: [{ operation: "read_file", path: "package.json" }],
    });
    expect(analysis.coverage).toBe("unknown");
    expect(() => validateReview(review(faithful, aligned), analysis)).toThrow();
  });
});
