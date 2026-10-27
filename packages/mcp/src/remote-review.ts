import { assertOutboundSafe } from "../../core/src/egress";
import { z } from "zod";
import {
  Request,
  validateReview,
  type Analysis,
} from "../../core/src/contracts";
import { LocalHistory } from "../../core/src/evidence/local-history";
import type { Reviewer } from "../../core/src/pipeline";
import { PROMPT_VERSION } from "../../core/src/prompt";

// Bounded, client-observed evidence. The remote service never treats it as an
// independently verified filesystem snapshot or as execution authorization.
export const RemoteReviewInput = z.strictObject({
  request: Request,
  analysis: z.strictObject({
    effects: z
      .array(
        z
          .object({
            id: z.string().min(1).max(64),
            kind: z.enum([
              "file_read",
              "file_write",
              "file_delete",
              "fixture_task",
              "unknown",
            ]),
            resource: z.string().max(1024),
            evidence: z.string().max(4096),
            certainty: z.enum(["direct", "unknown"]),
          })
          .catchall(z.json()),
      )
      .max(20),
    coverage: z.enum(["complete", "unknown"]),
    risk: z.enum(["low", "high"]),
    violations: z.array(z.string().max(2048)).max(50),
    localHistory: LocalHistory.optional(),
  }),
});
export const REMOTE_ENDPOINT =
  "https://approvallens-release.vercel.app/api/mcp";
export function remoteReviewer(
  token: string,
  endpoint = REMOTE_ENDPOINT,
): Reviewer {
  const url = new URL(endpoint);
  if (url.href !== REMOTE_ENDPOINT) throw Error("Untrusted review endpoint");
  const reviewer: Reviewer = async (request, analysis) => {
    const sanitized =
      request.toolCall.name === "write_file"
        ? {
            ...request,
            toolCall: {
              name: "write_file",
              args: {
                path: request.toolCall.args.path,
                content: "[CONTENT OMITTED]",
              },
            },
          }
        : request;
    const input = RemoteReviewInput.parse({ request: sanitized, analysis });
    assertOutboundSafe(input);
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "approvallens_review_evidence", arguments: input },
    });
    if (Buffer.byteLength(body) > 32768)
      throw Error("Review evidence exceeds transport limit");
    const response = await fetch(url, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(55000),
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${token}`,
      },
      body,
    });
    if (!response.ok)
      throw Error(`Hosted review unavailable (${response.status})`);
    const text = await response.text();
    if (text.length > 131072) throw Error("Review response exceeds limit");
    const envelope = JSON.parse(text);
    const result = envelope.result;
    if (envelope.error || result?.isError || !result?.structuredContent)
      throw Error("Hosted review failed");
    const data = result.structuredContent;
    if (
      data.executable !== false ||
      data.model !== "nvidia/nemotron-3-super-120b-a12b"
    )
      throw Error("Invalid reviewer identity");
    validateReview(data.output, analysis);
    return { output: data.output, model: data.model, usage: data.usage };
  };
  reviewer.promptVersion = PROMPT_VERSION;
  return reviewer;
}
export function remoteAnalysis(
  input: z.infer<typeof RemoteReviewInput>,
): Analysis {
  return input.analysis as Analysis;
}
