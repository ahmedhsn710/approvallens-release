import { expect, it } from "vitest";
import { nextStep } from "../packages/core/src/next-step";
import type { Decision } from "../packages/core/src/pipeline";
const decision = (outcome: Decision["outcome"], code: string): Decision => ({
  outcome,
  scope: { status: "permitted", violations: [] },
  reasons: [{ source: "policy", code, message: "" }],
});
it("keeps blocked proposals blocked even when the reviewer failed", () =>
  expect(
    nextStep(decision("block", "constraint_violation"), "reviewer_failed"),
  ).toContain("cannot be approved"));
it("asks for evidence when coverage is missing", () =>
  expect(nextStep(decision("review", "constraint_unassessed"))).toContain(
    "verifiable evidence",
  ));
it("does not turn allow into execution authorization", () =>
  expect(nextStep(decision("allow", "analysis_only"))).toContain(
    "explicit approval",
  ));
it("requires an explicit retry after review failure", () =>
  expect(nextStep(null, "invalid_review")).toContain("explicitly retry"));
