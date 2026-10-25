import { createHash } from "node:crypto";
import type { EvidenceEntry } from "../scope";
import { escapePointerPart } from "./pointers";

export const JSON_EVIDENCE_VERSION = "json-pointers-v2";
export const JSON_EVIDENCE_LIMITS = {
  chars: 16384,
  fields: 64,
  changes: 20,
  depth: 4,
} as const;
export type Scalar = string | number | boolean | null;
export type FieldDisclosure =
  "boolean" | "integer" | { enum: readonly Scalar[] };
export type JsonNode = Scalar | JsonNode[] | { [key: string]: JsonNode };
export type JsonObject = { [key: string]: JsonNode };
/** Only baseline bytes and provenance; all comparison/disclosure rules come from scope. */
export type JsonEvidenceContext = {
  path: string;
  before: string | null;
  snapshot: { id: string; manifestHash: string };
  kind?: "verified-snapshot" | "local-observation";
};
export type JsonValue = { present: false } | { present: true; value: Scalar };
export type JsonFieldChange = {
  id: string;
  pointer: string;
  operation: "add" | "remove" | "replace";
  before: JsonValue;
  after: JsonValue;
};
export type JsonChangeEvidence = {
  version: typeof JSON_EVIDENCE_VERSION;
  status: "complete" | "incomplete";
  scope: "json-pointers";
  source: {
    kind: "verified-snapshot" | "local-observation" | "unavailable";
    snapshotId: string | null;
    manifestHash: string | null;
    beforeSha256: string | null;
    afterSha256: string | null;
  };
  changes: JsonFieldChange[];
  limitations: string[];
};
const hash = (s: string) =>
  createHash("sha256").update(s, "utf8").digest("hex");
const own = (o: object, k: string) =>
  Object.prototype.hasOwnProperty.call(o, k);

/** JSON.parse validates syntax; a second bounded token walk rejects duplicate keys at every depth.
 * Preservation checks can compare arrays/type changes locally; disclosure never accepts arrays.
 */
export function parseConfiguration(
  text: string,
  disclosure = true,
): JsonObject {
  if (text.length > JSON_EVIDENCE_LIMITS.chars) throw Error("content_limit");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw Error("invalid_json");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw Error("unsupported_json_shape");
  const tokens = text.match(
    /"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}\[\]:,]/g,
  )!;
  let i = 0,
    fields = 0;
  function walk(depth: number): void {
    const token = tokens[i++]!;
    if (token === "{") {
      if (depth > JSON_EVIDENCE_LIMITS.depth) throw Error("depth_limit");
      const keys = new Set<string>();
      while (tokens[i] !== "}") {
        const key: string = JSON.parse(tokens[i++]!);
        if (keys.has(key)) throw Error("duplicate_json_key");
        keys.add(key);
        if (++fields > JSON_EVIDENCE_LIMITS.fields) throw Error("field_limit");
        i++; // colon; syntax already validated
        walk(depth + 1);
        if (tokens[i] === ",") i++;
      }
      i++;
    } else if (token === "[") {
      if (disclosure) throw Error("arrays_unsupported");
      if (depth > JSON_EVIDENCE_LIMITS.depth) throw Error("depth_limit");
      while (tokens[i] !== "]") {
        if (++fields > JSON_EVIDENCE_LIMITS.fields) throw Error("field_limit");
        walk(depth + 1);
        if (tokens[i] === ",") i++;
      }
      i++;
    } else if (
      disclosure &&
      /^-?\d/.test(token) &&
      (!Number.isSafeInteger(Number(token)) ||
        !/^-?(?:0|[1-9]\d*)$/.test(token))
    ) {
      throw Error("unsupported_number");
    }
  }
  walk(1);
  return parsed as JsonObject;
}
const EMPTY_OBJECT = Symbol("empty-object");
type Leaf = Scalar | typeof EMPTY_OBJECT;
function leaves(object: JsonObject): Map<string, Leaf> {
  const result = new Map<string, Leaf>();
  function visit(value: JsonNode, path: string) {
    if (value !== null && typeof value === "object") {
      const entries = Object.entries(value);
      if (!entries.length && path) result.set(path, EMPTY_OBJECT);
      for (const [key, child] of entries)
        visit(child, path + "/" + escapePointerPart(key));
    } else result.set(path, value);
  }
  visit(object, "");
  return result;
}
function disclosable(value: Leaf, rule: FieldDisclosure): value is Scalar {
  if (typeof value === "symbol") return false;
  if (rule === "boolean") return typeof value === "boolean";
  if (rule === "integer")
    return typeof value === "number" && Number.isSafeInteger(value);
  return rule.enum.some((candidate) => candidate === value);
}
/** after=null means deletion of the file, not an empty JSON object. */
export function jsonChangeEvidence(
  path: string,
  after: string | null,
  context: JsonEvidenceContext | undefined,
  fields: EvidenceEntry["fields"],
): JsonChangeEvidence {
  const result: JsonChangeEvidence = {
    version: JSON_EVIDENCE_VERSION,
    scope: "json-pointers",
    status: "complete",
    source: {
      kind: context?.kind ?? (context ? "verified-snapshot" : "unavailable"),
      snapshotId: context?.snapshot.id ?? null,
      manifestHash: context?.snapshot.manifestHash ?? null,
      beforeSha256: context?.before == null ? null : hash(context.before),
      afterSha256: after === null ? null : hash(after),
    },
    changes: [],
    limitations: [],
  };
  try {
    if (context && path !== context.path)
      throw Error("context_target_mismatch");
    if (!context || context.before === null)
      throw Error("baseline_unavailable");
    const before = leaves(parseConfiguration(context.before));
    const next =
      after === null
        ? new Map<string, Leaf>()
        : leaves(parseConfiguration(after));
    const changed = [...new Set([...before.keys(), ...next.keys()])]
      .sort()
      .filter(
        (key) =>
          before.has(key) !== next.has(key) ||
          before.get(key) !== next.get(key),
      );
    if (changed.length > JSON_EVIDENCE_LIMITS.changes)
      throw Error("change_limit");
    for (const key of changed) {
      const rule = own(fields, key) ? fields[key]! : null;
      if (
        !rule ||
        (before.has(key) && !disclosable(before.get(key)!, rule)) ||
        (next.has(key) && !disclosable(next.get(key)!, rule))
      ) {
        result.status = "incomplete";
        if (!result.limitations.includes("undisclosed_field_change"))
          result.limitations.push("undisclosed_field_change");
        continue;
      }
      result.changes.push({
        id: `change-${result.changes.length + 1}`,
        pointer: key,
        operation: !before.has(key)
          ? "add"
          : !next.has(key)
            ? "remove"
            : "replace",
        before: before.has(key)
          ? { present: true, value: before.get(key) as Scalar }
          : { present: false },
        after: next.has(key)
          ? { present: true, value: next.get(key) as Scalar }
          : { present: false },
      });
    }
  } catch (error) {
    result.status = "incomplete";
    result.changes = [];
    result.limitations = [
      error instanceof Error ? error.message : "evidence_unavailable",
    ];
  }
  return result;
}
