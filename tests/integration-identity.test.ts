import { expect, it } from "vitest";
import { policyHash } from "../packages/mcp/src/identity";
const policy = {
  version: 1,
  taskId: "test",
  developerIntent: "Enable feature",
  grants: [{ operation: "write_file", path: "feature.json" }],
  evidence: [{ path: "feature.json", fields: { "/enabled": "boolean" } }],
};
it("uses semantic object key order and includes evidence and intent in identity", () => {
  expect(policyHash(policy)).toBe(
    policyHash({
      ...policy,
      evidence: [{ fields: { "/enabled": "boolean" }, path: "feature.json" }],
    }),
  );
  expect(policyHash(policy)).not.toBe(
    policyHash({
      ...policy,
      evidence: [
        { path: "feature.json", fields: { "/enabled": { enum: [true] } } },
      ],
    }),
  );
  expect(policyHash(policy)).not.toBe(
    policyHash({ ...policy, developerIntent: "Different intent" }),
  );
});
