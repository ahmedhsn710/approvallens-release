import { describe, it, expect } from "vitest";
import {
  RuleSuggestionInput,
  validateSuggestion,
} from "../packages/mcp/src/rule-suggestions";
const input = {
  intent: "Update the application settings",
  stack: ["TypeScript" as const],
  paths: ["src/settings.json"],
};
describe("rule suggestion boundary", () => {
  it("produces an unapplied exact-path policy", () => {
    const result = validateSuggestion(
      {
        summary: "Update settings only",
        grants: [
          {
            operation: "write_file",
            path: "src/settings.json",
            reason: "Required for task",
          },
        ],
      },
      input,
    );
    expect(result).toMatchObject({
      applied: false,
      executable: false,
      policy: {
        shellInspection: false,
        grants: [{ operation: "write_file", path: "src/settings.json" }],
      },
    });
  });
  it("rejects invented paths, delete grants and additional authority", () => {
    for (const grant of [
      { operation: "write_file", path: "other.json" },
      { operation: "delete_file", path: "src/settings.json" },
    ])
      expect(() =>
        validateSuggestion(
          { summary: "Draft", grants: [{ ...grant, reason: "Task" }] },
          input,
        ),
      ).toThrow();
    expect(() =>
      validateSuggestion(
        { summary: "Draft", grants: [], shellInspection: true },
        input,
      ),
    ).toThrow();
  });
  it("rejects traversal, hidden paths and likely credential filenames", () => {
    for (const path of [
      "../outside",
      ".env",
      "src/.private/config.json",
      "src/secrets.json",
      "/etc/passwd",
    ])
      expect(
        RuleSuggestionInput.safeParse({ ...input, paths: [path] }).success,
      ).toBe(false);
  });
});
