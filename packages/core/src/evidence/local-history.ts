import { z } from "zod";

/** Local hook observations are not independently verified execution receipts. */
export const LocalHistory = z.strictObject({
  version: z.literal("local-action-history-v1"),
  source: z.literal("local-service-observations"),
  coverage: z.literal("same-conversation-since-service-start"),
  complete: z.literal(false),
  truncated: z.boolean(),
  entries: z
    .array(
      z.strictObject({
        operation: z.enum([
          "read_file",
          "write_file",
          "delete_file",
          "shell",
          "unsupported",
        ]),
        decision: z.enum([
          "allowed-by-policy",
          "blocked",
          "pending",
          "approved",
          "rejected",
          "other",
        ]),
        human: z.enum(["approved-once", "rejected", "not-recorded"]),
        completion: z.enum([
          "hook-reported-return",
          "hook-reported-failure-or-denial",
          "not-observed",
        ]),
      }),
    )
    .max(20),
});
export type LocalHistory = z.infer<typeof LocalHistory>;

export function captureLocalHistory(
  rows: Iterable<{
    conversationId: string;
    tool: string;
    status: string;
    outcome: string;
    humanDecision?: "approved-once" | "rejected";
  }>,
  conversationId: string,
): LocalHistory {
  const matching = Array.from(rows).filter(
    (row) => row.conversationId === conversationId,
  );
  return LocalHistory.parse({
    version: "local-action-history-v1",
    source: "local-service-observations",
    coverage: "same-conversation-since-service-start",
    complete: false,
    truncated: matching.length > 20,
    entries: matching.slice(-20).map((row) => ({
      operation:
        (
          {
            Read: "read_file",
            read_file: "read_file",
            Write: "write_file",
            write_file: "write_file",
            Delete: "delete_file",
            delete_file: "delete_file",
            Shell: "shell",
            shell: "shell",
          } as Record<string, string>
        )[row.tool] ?? "unsupported",
      decision:
        (
          {
            "policy-allowed": "allowed-by-policy",
            blocked: "blocked",
            "needs-review": "pending",
            "model-review": "pending",
            "human-approved": "approved",
            "approved-once": "approved",
            rejected: "rejected",
          } as Record<string, string>
        )[row.status] ?? "other",
      human: row.humanDecision ?? "not-recorded",
      completion:
        row.outcome === "tool-returned"
          ? "hook-reported-return"
          : row.outcome === "tool-failed-or-denied"
            ? "hook-reported-failure-or-denial"
            : "not-observed",
    })),
  });
}
