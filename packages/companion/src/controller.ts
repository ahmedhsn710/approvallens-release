import { captureLocalHistory } from "../../core/src/evidence/local-history";
import { nativeApprovalPrerequisites } from "../../mcp/src/approval";
import { createEvidenceProvider } from "../../mcp/src/evidence";
import { createHash, randomUUID } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { z } from "zod";
import {
  createReviewService,
  IntegrationPolicy,
  type SemanticBackend,
} from "../../mcp/src/core";
import { ToolCall } from "../../core/src/contracts";

export const CursorConfig = z.strictObject({
  workspace: z.string().min(1),
  policy: IntegrationPolicy,
  semantic: z
    .strictObject({
      mode: z.enum(["rules-only", "live"]).default("rules-only"),
      criticalReadPaths: z.array(z.string().min(1)).max(50).default([]),
      maxCalls: z.number().int().min(0).max(100).default(0),
      envFile: z.string().min(1).optional(),
    })
    .default({ mode: "rules-only", criticalReadPaths: [], maxCalls: 0 }),
  approvalMode: z.enum(["retry", "wait"]).default("retry"),
});
const Hook = z.object({
  hook_event_name: z.enum(["preToolUse", "postToolUse", "postToolUseFailure"]),
  conversation_id: z.string().min(1).max(200),
  generation_id: z.string().max(200).optional(),
  tool_use_id: z.string().min(1).max(200),
  tool_name: z.string().min(1).max(100),
  workspace_roots: z.array(z.string()).min(1).max(10),
  cwd: z.string().optional(),
  tool_input: z.record(z.string(), z.unknown()).default({}),
  agent_message: z.string().max(4096).optional(),
});
export type Activity = {
  id: string;
  conversationId: string;
  toolUseId: string;
  waiting?: boolean;
  routing?: string;
  contextNotes?: string[];
  semanticReview?: string;
  modelReview?: Awaited<
    ReturnType<ReturnType<typeof createReviewService>>
  >["review"];
  decision?: import("../../core/src/pipeline").Decision;
  assessment?: import("../../core/src/decision/assessment").DecisionAssessment;
  analysis?: import("../../core/src/contracts").Analysis;
  model?: string | null;
  usage?: unknown;
  versions?: Awaited<
    ReturnType<ReturnType<typeof createReviewService>>
  >["versions"];
  reviewLatencyMs?: number;
  reviewIdentity?: Awaited<
    ReturnType<ReturnType<typeof createReviewService>>
  >["identity"];
  humanDecision?: "approved-once" | "rejected";
  at: string;
  tool: string;
  target: string;
  status: string;
  reason: string;
  outcome: string;
  canApprove: boolean;
  fingerprint?: string;
  disclosure: string;
  intent: string;
};
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
/** The adapter never executes operations. Local same-user processes remain in its trust boundary. */
export function createCursorController(
  raw: unknown,
  save: (row: Activity) => void,
  now = Date.now,
  backend?: SemanticBackend,
) {
  const config = CursorConfig.parse(raw);
  const root = realpathSync(config.workspace);
  const evidence = createEvidenceProvider(root);
  const review = createReviewService(config.policy, undefined, evidence);
  const semantic =
    config.semantic.mode === "live" && backend
      ? createReviewService(config.policy, backend, evidence)
      : undefined;
  const pending = new Map<
    string,
    {
      row: Activity;
      key: string;
      expires: number;
      details: unknown;
      finish?: (allow: boolean, reason?: string) => void;
      unchanged?: () => boolean;
    }
  >();
  const permits = new Map<string, number>();
  const calls = new Map<string, Activity>();
  function persist(row: Activity) {
    save(structuredClone(row));
  }
  function fileInfo(input: Record<string, unknown>) {
    const paths = ["path", "file_path", "target_file"].filter(
      (k) => input[k] !== undefined,
    );
    if (paths.length !== 1) throw Error("ambiguous_path");
    const supplied = input[paths[0]!];
    if (typeof supplied !== "string") throw Error("invalid_path");
    const absolute = isAbsolute(supplied) ? supplied : resolve(root, supplied);
    const rel = relative(root, absolute);
    if (
      !rel ||
      rel.startsWith("..") ||
      isAbsolute(rel) ||
      rel.includes("\\") ||
      /[\x00-\x1f]/.test(rel)
    )
      throw Error("outside_workspace");
    let current = root;
    for (const part of rel.split(sep)) {
      current = resolve(current, part);
      try {
        if (lstatSync(current).isSymbolicLink()) throw Error("symlink");
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
    }
    let state = "missing";
    try {
      const st = lstatSync(absolute);
      if (!st.isFile() || st.size > 1048576) throw Error("unsupported_file");
      state = hash(readFileSync(absolute).toString("base64"));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    return { path: rel, state };
  }
  function expire() {
    for (const [key, expiry] of permits)
      if (expiry <= now()) permits.delete(key);
    for (const [id, item] of pending)
      if (item.expires <= now()) {
        item.finish?.(false, "Review expired before a decision.");
        pending.delete(id);
        item.row.canApprove = false;
        item.row.status = "expired";
        item.row.reason = "Review expired; request a new action.";
        persist(item.row);
      }
  }
  return {
    expire,
    inspect(id: string) {
      const item = pending.get(id);
      return item && item.expires > now()
        ? { ...item.row, proposedAction: item.details }
        : null;
    },
    approve(id: string) {
      const item = pending.get(id);
      if (!item || !item.row.canApprove || item.expires <= now())
        return { ok: false };
      if (item.finish) {
        let unchanged = false;
        try {
          unchanged = item.unchanged?.() === true;
        } catch {
          /* deny */
        }
        if (!unchanged) {
          item.row.reason =
            "File changed while waiting; request a fresh review.";
          item.finish(
            false,
            "File changed while waiting; request a fresh review.",
          );
          return { ok: false };
        }
        item.row.humanDecision = "approved-once";
        item.finish(true);
        return { ok: true };
      }
      permits.set(item.key, now() + 30000);
      pending.delete(id);
      item.row.humanDecision = "approved-once";
      item.row.status = "approved-once";
      item.row.canApprove = false;
      item.row.reason =
        "Retry the identical action within 30 seconds; changed files require review again.";
      persist(item.row);
      return { ok: true };
    },
    reject(id: string) {
      const item = pending.get(id);
      if (!item) return { ok: false };
      item.row.humanDecision = "rejected";
      if (item.finish) {
        item.finish(false, "Developer rejected this operation.");
        return { ok: true };
      }
      pending.delete(id);
      permits.delete(item.key);
      item.row.status = "rejected";
      item.row.canApprove = false;
      persist(item.row);
      return { ok: true };
    },
    async event(rawEvent: unknown, signal?: AbortSignal) {
      const started = now();
      const parsed = Hook.safeParse(rawEvent);
      if (!parsed.success) {
        // Do not persist unvalidated arguments, error payloads, or claimed identities.
        persist({
          id: randomUUID(),
          conversationId: "diagnostics",
          toolUseId: "unknown",
          at: new Date(now()).toISOString(),
          tool: "Hook diagnostic",
          target: "[arguments withheld]",
          status: "blocked",
          reason:
            "Hook payload rejected: " +
            [
              ...new Set(
                parsed.error.issues.map((i) => String(i.path[0] || "payload")),
              ),
            ].join(", "),
          outcome: "unverified-event",
          canApprove: false,
          disclosure: "NOT_MEASURED",
          intent: "NOT_MEASURED",
        });
        return {
          permission: "deny",
          user_message: "ApprovalLens: invalid hook payload; see diagnostics.",
        };
      }
      const event = parsed.data;
      let workspaceMatches = false;
      try {
        workspaceMatches =
          event.workspace_roots.length === 1 &&
          realpathSync(event.workspace_roots[0]!) === root &&
          (!event.cwd || realpathSync(event.cwd) === root);
      } catch {
        /* invalid or missing workspace is never authorized */
      }
      if (!workspaceMatches) {
        persist({
          id: randomUUID(),
          conversationId: "diagnostics",
          toolUseId: "unknown",
          at: new Date(now()).toISOString(),
          tool: "Hook diagnostic",
          target: "[arguments withheld]",
          status: "blocked",
          reason:
            "Hook workspace or working directory does not match configured root.",
          outcome: "unverified-event",
          canApprove: false,
          disclosure: "NOT_MEASURED",
          intent: "NOT_MEASURED",
        });
        return {
          permission: "deny",
          user_message: "ApprovalLens: workspace mismatch.",
        };
      }
      const correlation = JSON.stringify([
        event.conversation_id,
        event.tool_use_id,
        event.tool_name,
      ]);
      if (event.hook_event_name !== "preToolUse") {
        const row = calls.get(correlation);
        if (row) {
          row.outcome =
            event.hook_event_name === "postToolUse"
              ? "tool-returned"
              : "tool-failed-or-denied";
          persist(row);
        } else {
          persist({
            id: randomUUID(),
            conversationId: event.conversation_id,
            toolUseId: event.tool_use_id,
            at: new Date(now()).toISOString(),
            tool: event.tool_name,
            target: "[arguments withheld]",
            status: "observed-only",
            reason:
              "Completion received without a matching pre-tool event. Authorization was not observed.",
            outcome:
              event.hook_event_name === "postToolUse"
                ? "tool-returned"
                : "tool-failed-or-denied",
            canApprove: false,
            disclosure: "NOT_MEASURED",
            intent: "NOT_MEASURED",
          });
        }
        return {};
      }
      // Bound retained in-memory request metadata. Expired grants cannot silently survive restarts.
      expire();
      if (calls.size >= 1000) calls.delete(calls.keys().next().value!);
      if (pending.size >= 100) throw Error("review_queue_full");
      const localHistory = captureLocalHistory(
        calls.values(),
        event.conversation_id,
      );
      let waiting: Promise<boolean> | undefined;
      const row: Activity = {
        id: randomUUID(),
        conversationId: event.conversation_id,
        toolUseId: event.tool_use_id,
        at: new Date(now()).toISOString(),
        tool: event.tool_name,
        target: "[arguments withheld]",
        status: "blocked",
        reason: "Unsupported native operation; no approval override.",
        outcome: "not-observed",
        canApprove: false,
        disclosure: "NOT_MEASURED",
        intent: "NOT_MEASURED",
      };
      let permission = "deny";
      try {
        const input = event.tool_input;
        let call: ToolCall;
        let state = "";
        const nativeName =
          (
            {
              read_file: "Read",
              write_file: "Write",
              delete_file: "Delete",
            } as Record<string, string>
          )[event.tool_name] ?? event.tool_name;
        if (["shell", "Shell", "run_fixture_task"].includes(nativeName)) {
          const shell = nativeName === "shell" || nativeName === "Shell";
          // Cursor sends description and directory fields with Shell. Only the command string is retained, and the call stays non-approvable.
          let parsed: ToolCall | undefined;
          try {
            parsed = ToolCall.parse({
              name: shell ? "shell" : nativeName,
              args: shell ? { command: input.command } : input,
            });
          } catch {
            row.status = "blocked";
            row.canApprove = false;
            row.target = shell ? "opaque shell" : "[arguments withheld]";
            row.reason = shell
              ? "Opaque shell command: unassessed, high risk, never approvable."
              : "Fixed task checked; this native hook has no task approval handler.";
          }
          if (parsed) {
            call = parsed;
            const result = await (
              call.name === "shell" ? review : (semantic ?? review)
            )(
              {
                toolCall: call,
                agentExplanation:
                  event.agent_message ||
                  "[Explanation unavailable in hook event]",
              },
              localHistory,
            );
            row.decision = result.decision;
            row.assessment = result.assessment;
            row.analysis = result.analysis;
            row.target =
              call.name === "run_fixture_task"
                ? call.args.task
                : "opaque shell";
            row.reason =
              call.name === "shell"
                ? "Opaque shell command: unassessed, high risk, never approvable."
                : "Fixed task checked; this native hook has no task approval handler.";
          }
        } else if (["Read", "Write", "Delete"].includes(nativeName)) {
          const allowedKeys = [
            "path",
            "file_path",
            "target_file",
            ...(nativeName === "Write" ? ["content"] : []),
          ];
          if (Object.keys(input).some((key) => !allowedKeys.includes(key)))
            throw Error("unsupported_arguments");
          const info = fileInfo(input);
          row.target = info.path;
          state = info.state;
          if (nativeName === "Read")
            call = { name: "read_file", args: { path: info.path } };
          else if (nativeName === "Delete")
            call = { name: "delete_file", args: { path: info.path } };
          else {
            if (typeof input.content !== "string")
              throw Error("unsupported_write_payload");
            call = ToolCall.parse({
              name: "write_file",
              args: { path: info.path, content: input.content },
            });
          }
          let result = await review(
            {
              toolCall: call,
              agentExplanation:
                event.agent_message ||
                "[Explanation unavailable in hook event]",
            },
            localHistory,
          );
          row.decision = result.decision;
          row.assessment = result.assessment;
          row.analysis = result.analysis;
          row.reviewIdentity = result.identity;
          row.fingerprint = hash(
            JSON.stringify([
              root,
              config.policy,
              event.conversation_id,
              event.tool_name,
              event.tool_input,
              state,
            ]),
          );
          const key = row.fingerprint;
          if (
            result.decision.scope.status === "denied" ||
            result.decision.outcome === "block"
          ) {
            row.status = "blocked";
            row.reason = result.decision.reasons
              .map((reason) => reason.message)
              .join("; ");
          } else if (
            result.decision.reasons.some(
              (reason) => reason.code === "constraint_unassessed",
            )
          ) {
            row.reason =
              "Explicit restrictions could not be checked; configure supported JSON evidence.";
          } else if (
            result.analysis.effects.some(
              (effect) =>
                effect.content?.status === "incomplete" ||
                effect.inspection?.status === "incomplete",
            )
          ) {
            row.reason =
              "Configuration evidence is incomplete; approval unavailable.";
          } else if (result.analysis.coverage !== "complete")
            row.reason = "Incomplete effect coverage.";
          else if (
            call.name === "read_file" &&
            !config.semantic.criticalReadPaths.includes(call.args.path)
          ) {
            row.routing = "exact-granted-read";
            permission = "allow";
            row.status = "policy-allowed";
            row.reason = "Exact read grant; semantic fidelity not measured.";
          } else if ((permits.get(key) ?? 0) > now()) {
            permits.delete(key);
            permission = "allow";
            row.status = "human-approved";
            row.reason = "Single-use matching authorization consumed.";
          } else {
            row.routing =
              call.name === "read_file" ? "critical-read" : "file-mutation";
            if (config.semantic.mode === "live") {
              row.status = "model-review";
              row.reason =
                "Repository checks passed; waiting for Nemotron findings.";
              persist(row);
              if (!semantic) throw Error("semantic_backend_unavailable");
              const reviewStarted = now();
              result = await semantic(
                {
                  toolCall: call,
                  agentExplanation:
                    event.agent_message ||
                    "[Explanation unavailable in hook event]",
                },
                localHistory,
              );
              row.decision = result.decision;
              row.assessment = result.assessment;
              row.analysis = result.analysis;
              row.semanticReview = result.semanticReview;
              row.modelReview = result.review;
              row.model = result.model;
              row.usage = result.usage;
              row.versions = result.versions;
              row.reviewIdentity = result.identity;
              row.reviewLatencyMs = Math.max(0, now() - reviewStarted);
              if (
                !result.review ||
                !nativeApprovalPrerequisites({
                  analysis: result.analysis,
                  decision: result.decision,
                  review: result.review,
                  semanticRequired: true,
                  semanticMeasured: result.semanticReview === "MEASURED",
                }).eligible
              ) {
                row.reason = result.error
                  ? `Required model review failed (${result.error}); no approval available.`
                  : result.decision.reasons
                      .map((reason) => reason.message)
                      .join("; ");
                row.status = "blocked";
                persist(row);
                calls.set(correlation, row);
                return {
                  permission: "deny",
                  user_message: `ApprovalLens: ${row.reason}`,
                };
              }
              // Absence of hook metadata is not evidence the agent misled the developer.
              if (!event.agent_message?.trim()) {
                row.modelReview = {
                  ...result.review,
                  disclosure: {
                    fidelity: "unknown",
                    findings: [],
                    unresolvedQuestions: [
                      "Cursor did not supply the agent explanation for this tool call.",
                    ],
                  },
                };
                row.contextNotes = [
                  "Disclosure downgraded to unknown by the adapter because the hook omitted its explanation. Intent is compared with the configured repository task, not the current chat transcript.",
                ];
              }
              row.disclosure = row.modelReview!.disclosure.fidelity;
              row.intent = result.review.intent.alignment;
            }
            if (fileInfo(input).state !== state)
              throw Error("file_changed_during_review");
            if (signal?.aborted || now() - started >= 100000)
              throw Error("request_cancelled");
            row.status = "needs-review";
            row.canApprove = true;
            row.reason =
              row.semanticReview === "MEASURED"
                ? `Repository checks passed. Model disclosure: ${row.disclosure}; intent: ${row.intent}. Your decision is required.`
                : "Within scope; explicit one-time approval required. Semantic fidelity not measured.";
            pending.set(row.id, {
              row,
              key,
              expires: now() + 300000,
              details: structuredClone(call),
            });
            if (config.approvalMode === "wait") {
              row.waiting = true;
              row.reason +=
                " This tool call is waiting; the total review deadline is 100 seconds.";
              const remaining = Math.max(1, 100000 - (now() - started));
              const item = pending.get(row.id)!;
              item.expires = now() + remaining;
              item.unchanged = () => fileInfo(input).state === state;
              waiting = new Promise<boolean>((resolve) => {
                let done = false;
                const abort = () =>
                  finish(
                    false,
                    "Hook disconnected or the tool call was cancelled.",
                  );
                const timer = setTimeout(
                  () => finish(false, "Total review deadline expired."),
                  remaining,
                );
                const finish = (
                  allow: boolean,
                  reason = "Operation denied.",
                ) => {
                  if (done) return;
                  done = true;
                  clearTimeout(timer);
                  signal?.removeEventListener("abort", abort);
                  pending.delete(row.id);
                  row.canApprove = false;
                  row.waiting = false;
                  row.status = allow ? "human-approved" : "rejected";
                  row.reason = allow
                    ? "Approved for this waiting tool call only."
                    : reason;
                  persist(row);
                  resolve(allow);
                };
                item.finish = finish;
                signal?.addEventListener("abort", abort, { once: true });
                if (signal?.aborted) finish(false);
              });
            }
          }
        }
      } catch {
        row.status = "blocked";
        row.reason =
          "Invalid, ambiguous, outside-workspace or unsupported file operation.";
        row.canApprove = false;
      }
      persist(row);
      calls.set(correlation, row);
      if (waiting) permission = (await waiting) ? "allow" : "deny";
      return {
        permission,
        user_message: `ApprovalLens: ${row.reason}`,
        agent_message:
          permission === "deny"
            ? "Action denied. Do not retry automatically; developer review is required."
            : undefined,
      };
    },
  };
}
