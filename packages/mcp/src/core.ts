import { assertOutboundSafe, EgressBlocked } from "../../core/src/egress";
import { LocalHistory } from "../../core/src/evidence/local-history";
import {
  JsonReplacement,
  reconstructJsonReplacement,
} from "./json-replacement";
import type { EvidenceProvider } from "./evidence";
import { z } from "zod";
import { ToolCall } from "../../core/src/contracts";
import { IntegrationPolicy } from "./policy";
export { IntegrationPolicy } from "./policy";
import { createHash } from "node:crypto";
import { canonicalPolicy, policyHash } from "./identity";
import { nativeApprovalPrerequisites } from "./approval";
import { pipeline, type Reviewer } from "../../core/src/pipeline";

export type SemanticBackend = {
  reviewer: Reviewer;
  reserve: () => boolean;
  halted?: () => boolean;
};

export const IntegrationRequest = z.strictObject({
  toolCall: z.union([ToolCall, JsonReplacement]),
  agentExplanation: z.string().min(1).max(4096),
});

/** Single transport-independent engine for MCP and native-tool integrations. */
export function createReviewService(
  input: IntegrationPolicy,
  backend?: SemanticBackend,
  evidence?: EvidenceProvider,
) {
  const policy = IntegrationPolicy.parse(structuredClone(input));
  let busy = false;
  return async (raw: unknown, trustedHistory?: LocalHistory) => {
    const localHistory = trustedHistory
      ? LocalHistory.parse(trustedHistory)
      : undefined;
    const { toolCall: proposed, agentExplanation } =
      IntegrationRequest.parse(raw);
    const path = "path" in proposed.args ? proposed.args.path : undefined;
    const entry = policy.evidence?.find((entry) => entry.path === path);
    let context;
    const evidenceCall =
      proposed.name === "replace_json_text"
        ? {
            name: "write_file" as const,
            args: { path: proposed.args.path, content: "" },
          }
        : proposed;
    try {
      context = entry ? evidence?.(evidenceCall, entry) : undefined;
    } catch {
      context = undefined;
    }
    if (proposed.name === "replace_json_text" && !entry)
      throw Error("replacement_requires_json_policy");
    const toolCall =
      proposed.name === "replace_json_text"
        ? reconstructJsonReplacement(proposed, context)
        : proposed;
    const request = {
      taskId: policy.taskId,
      developerIntent: policy.developerIntent,
      toolCall,
      agentExplanation,
    };
    // Ask the existing pipeline first; this adapter does not invent policy rules.
    const scope = {
      grants: policy.grants,
      constraints: policy.constraints,
      evidence: policy.evidence,
    };
    const preliminary = await pipeline(
      request,
      scope,
      undefined,
      context,
      localHistory,
    );
    const semanticSkipReason =
      preliminary.decision.outcome === "block"
        ? "policy_blocked"
        : preliminary.assessment.evidence.incomplete ||
            preliminary.assessment.preservation.unassessed.length
          ? "evidence_incomplete"
          : null;
    const eligibleBackend = semanticSkipReason ? undefined : backend;
    let admissionError: string | null = null;
    if (eligibleBackend) {
      if (busy) admissionError = "review_busy";
      else {
        try {
          assertOutboundSafe(
            {
              developerIntent: request.developerIntent,
              agentExplanation,
              analysis: preliminary.analysis,
            },
            policy.blockedTerms,
          );
          if (eligibleBackend.halted?.()) admissionError = "live_review_halted";
          else if (!eligibleBackend.reserve())
            admissionError = eligibleBackend.halted?.()
              ? "live_review_halted"
              : "live_budget_exhausted";
        } catch (error) {
          admissionError =
            error instanceof EgressBlocked
              ? "outbound_data_blocked"
              : "budget_unavailable";
        }
      }
    }
    if (eligibleBackend && !admissionError) busy = true;
    try {
      const result =
        eligibleBackend && !admissionError
          ? await pipeline(
              request,
              scope,
              eligibleBackend.reviewer,
              context,
              localHistory,
            )
          : preliminary;
      const error = admissionError || result.errorCategory;
      const digest = (value: unknown) =>
        createHash("sha256").update(canonicalPolicy(value)).digest("hex");
      const nativePrerequisites = nativeApprovalPrerequisites({
        analysis: result.analysis,
        decision: result.decision,
        review: result.review,
        semanticRequired: !!backend,
        semanticMeasured: !!eligibleBackend && !error,
      });
      const output = {
        contractVersion: "integration-result-v1",
        actionRepresentation:
          proposed.name === "replace_json_text"
            ? "reconstructed-json-write"
            : "declared-action",
        identity: {
          policyHash: policyHash(policy),
          actionHash: digest(toolCall),
          intentHash: digest({
            taskId: policy.taskId,
            developerIntent: policy.developerIntent,
          }),
          evidenceHash: digest(result.analysis),
        },
        intentSource: "developer-policy" as const,
        conversationIntentAvailable: false,
        approval: {
          state: "advisory-only" as const,
          executionAuthorized: false as const,
        },
        nativePrerequisites,
        latencyMs: result.latencyMs,
        mode: backend ? "LIVE" : "RULES_ONLY",
        advisoryOnly: true,
        executable: false,
        semanticSkipReason,
        semanticReview: eligibleBackend
          ? error
            ? "FAILED"
            : "MEASURED"
          : "NOT_MEASURED",
        policyTaskId: policy.taskId,
        analysis: result.analysis,
        decision: result.decision,
        assessment: result.assessment,
        review: result.review,
        error,
        model: result.model,
        usage: result.usage,
        versions: result.versions,
      };
      return output;
    } finally {
      if (eligibleBackend && !admissionError) busy = false;
    }
  };
}
