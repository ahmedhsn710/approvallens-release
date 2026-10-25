import { z } from "zod";
import { createHash } from "node:crypto";
import type { JsonEvidenceContext } from "../../core/src/evidence/json-changes";
import type { ToolCall } from "../../core/src/contracts";
/** Explicit advisory input. Never a shell command or an instruction to execute an edit. */
export const JsonReplacement = z.strictObject({
  name: z.literal("replace_json_text"),
  args: z.strictObject({
    path: z.string().min(1).max(1024),
    baselineSha256: z.string().regex(/^[a-f0-9]{64}$/),
    oldText: z.string().min(1).max(16384),
    newText: z.string().max(16384),
  }),
});
export function reconstructJsonReplacement(
  raw: z.infer<typeof JsonReplacement>,
  baseline?: JsonEvidenceContext,
): Extract<ToolCall, { name: "write_file" }> {
  const { path, baselineSha256, oldText, newText } = raw.args;
  if (!baseline || baseline.path !== path || baseline.before === null)
    throw Error("replacement_baseline_unavailable");
  const before = baseline.before;
  if (
    before.length > 16384 ||
    createHash("sha256").update(before, "utf8").digest("hex") !== baselineSha256
  )
    throw Error("replacement_baseline_stale");
  const start = before.indexOf(oldText);
  // Count overlapping matches too; ambiguous replacements never select a convenient occurrence.
  if (start < 0 || before.indexOf(oldText, start + 1) >= 0)
    throw Error("replacement_match_not_unique");
  const content =
    before.slice(0, start) + newText + before.slice(start + oldText.length);
  if (content.length > 16384) throw Error("replacement_result_too_large");
  return { name: "write_file", args: { path, content } };
}
