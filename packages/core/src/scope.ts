import { z } from "zod";
import { isFieldPointer } from "./evidence/pointers";

/**
 * Trusted task scope, version `policy-evidence-v5`.
 * v5 binds comparison and disclosure rules to the same approval scope.
 * v4 adds optional explicit field-preservation restrictions alongside exact grants.
 *
 * v3 adds the `run_fixture_task` operation. For it, `path` is the fixed fixture task id (for example
 * `acceptance-test`), not a file. Every v2 grant remains valid and means the same thing in v3.
 *
 * v1 (`allowedPaths`) listed paths only, so permission to read a path also
 * permitted writing or deleting it. A v2 grant names one operation and one
 * normalized exact path. A read grant never implies write or delete, a grant
 * for a path never covers a directory prefix, and shell has no grant at all.
 * Scopes are owned by the server (scenario definitions); clients never supply
 * them.
 */
export const SCOPE_VERSION = "policy-evidence-v5";

export const GrantOperation = z.enum([
  "read_file",
  "write_file",
  "delete_file",
  "run_fixture_task",
]);
export type GrantOperation = z.infer<typeof GrantOperation>;

/**
 * Lexical check only: a workspace-relative path in normalized form with no
 * traversal, absolute/drive prefix, backslash, control character or empty
 * segment. It does not touch the filesystem and says nothing about symlinks.
 */
export function isNormalizedRelativePath(path: string): boolean {
  if (path.length === 0 || path.startsWith("/") || path.includes("\\"))
    return false;
  if (/[\u0000-\u001f\u007f]/.test(path) || /^[A-Za-z]:/.test(path))
    return false;
  return path
    .split("/")
    .every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

const GrantPath = z
  .string()
  .min(1)
  .max(1024)
  .refine(
    isNormalizedRelativePath,
    "Grant path must be a normalized workspace-relative path",
  );

export const Grant = z.strictObject({
  operation: GrantOperation,
  path: GrantPath,
});
export type Grant = z.infer<typeof Grant>;

/** Explicit server/developer policy, never inferred from agent prose. */
export const JsonConstraint = z.strictObject({
  id: z.string().min(1).max(64),
  path: GrantPath,
  kind: z.literal("preserve_field"),
  field: z
    .string()
    .min(1)
    .max(512)
    .refine(
      (s) => !s.startsWith("/") || isFieldPointer(s),
      "Invalid JSON pointer",
    ),
});
export type JsonConstraint = z.infer<typeof JsonConstraint>;
export const FieldDisclosureSchema = z.union([
  z.literal("boolean"),
  z.literal("integer"),
  z.strictObject({
    enum: z
      .array(
        z.union([
          z.string().max(256),
          z.number().int().safe(),
          z.boolean(),
          z.null(),
        ]),
      )
      .min(1)
      .max(32),
  }),
]);
export const EvidenceEntry = z.strictObject({
  path: GrantPath.refine(
    (path) => path.endsWith(".json"),
    "Evidence requires a JSON file",
  ),
  fields: z
    .record(
      z
        .string()
        .max(512)
        .refine(isFieldPointer, "Disclosure keys must be JSON pointers"),
      FieldDisclosureSchema,
    )
    .refine(
      (fields) => Object.keys(fields).length <= 64,
      "Too many disclosure fields",
    ),
});
export type EvidenceEntry = z.infer<typeof EvidenceEntry>;
export const EvidenceEntries = z
  .array(EvidenceEntry)
  .max(20)
  .refine(
    (entries) => new Set(entries.map((e) => e.path)).size === entries.length,
    "Evidence paths must be unique",
  );
export const ScopeSchema = z.strictObject({
  grants: z.array(Grant).max(50),
  evidence: EvidenceEntries.optional(),
  constraints: z
    .array(JsonConstraint)
    .max(20)
    .refine(
      (items) => new Set(items.map((item) => item.id)).size === items.length,
      "Constraint IDs must be unique",
    )
    .optional(),
});
export type Scope = {
  grants: readonly Grant[];
  constraints?: readonly JsonConstraint[];
  evidence?: readonly EvidenceEntry[];
};

/** Validate untrusted scope data (for example a stored row or fixture metadata). */
export function parseScope(raw: unknown): Scope {
  return ScopeSchema.parse(raw);
}

export type GrantMatch =
  "granted" | "operation_not_granted" | "path_not_granted";

/** Exact operation and exact path. No prefixes, globs, case folding or implication between operations. */
export function matchGrant(
  scope: Scope,
  operation: GrantOperation,
  path: string,
): GrantMatch {
  let pathSeen = false;
  for (const grant of scope.grants) {
    if (grant.path !== path) continue;
    pathSeen = true;
    if (grant.operation === operation) return "granted";
  }
  return pathSeen ? "operation_not_granted" : "path_not_granted";
}
