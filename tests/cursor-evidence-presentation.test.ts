import { createRequire } from "node:module";
import { expect, it } from "vitest";
const { evidenceLines } = createRequire(import.meta.url)(
  "../packages/extension/evidence.cjs",
);
const { demoPrompts } = createRequire(import.meta.url)(
  "../packages/extension/prompts.cjs",
);
it("shows disclosed pointers and preserve results without exposing raw proposal", () => {
  const result = evidenceLines({
    analysis: {
      effects: [
        {
          content: {
            status: "complete",
            source: { kind: "local-observation" },
            changes: [
              {
                pointer: "/strict",
                before: { present: true, value: false },
                after: { present: true, value: true },
              },
            ],
            limitations: [],
          },
          constraintChecks: [
            { field: "/retries", id: "keep", status: "passed" },
          ],
        },
      ],
    },
    proposedAction: { content: "RAW_SECRET" },
    humanDecision: "approved-once",
    versions: { prompt: "v8" },
    reviewLatencyMs: 20,
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  }).join("\n");
  expect(result).toContain("/strict: false → true");
  expect(result).toContain("Preserve /retries: passed");
  expect(result).toContain("Human: approved-once");
  expect(result).toContain("input 10, output 5");
  expect(result).not.toContain("RAW_SECRET");
});
it("labels uninspected file mutations without pretending to know their contents", () => {
  expect(
    evidenceLines({ analysis: { effects: [{ kind: "file_write" }] } }).join(
      "\n",
    ),
  ).toContain("Contents were not inspected");
  expect(evidenceLines({})).toEqual([]);
});
it("keeps only short sample prompts for the shield to copy", () => {
  const prompts = demoPrompts({
    prompts: [
      { title: "1. Read", text: "Use Read to read package.json." },
      { title: "", text: "no" },
      { text: "missing title" },
    ],
  });
  expect(prompts).toEqual([
    { title: "1. Read", text: "Use Read to read package.json." },
  ]);
  expect(demoPrompts("not json")).toEqual([]);
});
it("labels history as incomplete observations rather than execution proof", () => {
  const text = evidenceLines({
    analysis: { localHistory: { entries: [{}], truncated: true } },
  }).join("\n");
  expect(text).toContain("Prior local observations: 1 (bounded window)");
  expect(text).toContain("not independently verified");
});
