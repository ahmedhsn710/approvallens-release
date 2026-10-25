import { isDeepStrictEqual } from "node:util";
import type { JsonConstraint } from "../scope";
import { parseConfiguration, type JsonNode } from "./json-changes";
import { pointerParts } from "./pointers";
export type ConstraintCheck = {
  id: string;
  kind: "preserve_field";
  field: string;
  status: "passed" | "violated" | "unknown";
};
function lookup(
  root: JsonNode,
  pointer: string,
): { present: boolean; value?: JsonNode } {
  let value = root;
  for (const part of pointerParts(pointer)) {
    if (
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      !Object.prototype.hasOwnProperty.call(value, part)
    )
      return { present: false };
    value = value[part]!;
  }
  return { present: true, value };
}
/** Compare real local values without disclosing them. Null/undefined baseline means unavailable. */
export function checkConstraints(
  before: string | null | undefined,
  after: string | null,
  rules: readonly JsonConstraint[],
): ConstraintCheck[] {
  const checks: ConstraintCheck[] = rules.map((rule) => ({
    id: rule.id,
    kind: rule.kind,
    field: rule.field,
    status: "unknown",
  }));
  if (before == null) return checks;
  // A known file being deleted violates preservation even if its JSON cannot be parsed.
  if (after === null)
    return checks.map((check) => ({ ...check, status: "violated" }));
  try {
    const previous = parseConfiguration(before, false);
    const proposed = parseConfiguration(after, false);
    for (const check of checks) {
      const a = lookup(previous, check.field),
        b = lookup(proposed, check.field);
      check.status = isDeepStrictEqual(a, b) ? "passed" : "violated";
    }
  } catch {
    /* Unknown: ambiguous/unsupported bytes never establish preservation. */
  }
  return checks;
}
