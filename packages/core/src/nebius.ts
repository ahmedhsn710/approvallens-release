import { assertOutboundSafe } from "./egress";
import type { Request } from "./contracts";
import {
  PROMPT_VERSION,
  REVIEW_SCHEMA_NAME,
  buildSystemPrompt,
  reviewJsonSchema,
} from "./prompt";
import type { Reviewer } from "./pipeline";

export const MAX_OUTPUT_TOKENS = 1800;
export const TIMEOUT_MS = 45_000;

type ChatResponse = {
  choices?: {
    finish_reason?: string;
    message?: { content?: string; refusal?: string };
  }[];
  usage?: unknown;
};

function parseJsonOrNull(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Handed to the local validator as null so it is reported as invalid output,
    // not as a provider failure. The malformed text is never stored or logged.
    return null;
  }
}

export function nebiusReviewer(mode: "grounded" | "raw"): Reviewer {
  const key = process.env.NEBIUS_API_KEY;
  const model = process.env.NEBIUS_MODEL;
  const base = new URL(
    process.env.NEBIUS_BASE_URL || "https://api.tokenfactory.nebius.com/v1/",
  );
  if (!key || !model)
    throw new Error("Set NEBIUS_API_KEY and the exact NEBIUS_MODEL in .env");
  if (
    base.protocol !== "https:" ||
    base.hostname !== "api.tokenfactory.nebius.com" ||
    base.username ||
    base.password
  ) {
    throw new Error("Only the official HTTPS Nebius endpoint is supported");
  }
  const endpoint = new URL(
    "chat/completions",
    base.href.endsWith("/") ? base.href : `${base.href}/`,
  );
  const schema = reviewJsonSchema();
  // Same prompt, schema, model and budget in both modes; only the user payload differs.
  const system = buildSystemPrompt(schema);

  const review: Reviewer = async (request, analysis) => {
    // Never send raw write contents. Grounded evidence may include explicitly disclosed
    // synthetic configuration changes derived from a server-verified snapshot.
    const tool: Request["toolCall"] =
      request.toolCall.name === "write_file"
        ? {
            name: "write_file",
            args: {
              path: request.toolCall.args.path,
              content: "[CONTENT OMITTED]",
            },
          }
        : request.toolCall;
    const common = {
      developerIntent: request.developerIntent,
      agentExplanation: request.agentExplanation,
    };
    const payload =
      mode === "grounded"
        ? {
            ...common,
            effects: analysis.effects,
            coverage: analysis.coverage,
            ...(analysis.history ? { history: analysis.history } : {}),
            ...(analysis.localHistory
              ? { localHistory: analysis.localHistory }
              : {}),
          }
        : { ...common, toolCall: tool };

    assertOutboundSafe(payload);
    const response = await fetch(endpoint, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: MAX_OUTPUT_TOKENS,
        response_format: {
          type: "json_schema",
          json_schema: { name: REVIEW_SCHEMA_NAME, strict: true, schema },
        },
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify(payload) },
        ],
      }),
    });
    if (!response.ok) throw new Error(`Nebius HTTP ${response.status}`);

    const body = (await response.json()) as ChatResponse;
    const choice = body.choices?.[0];
    if (
      choice?.finish_reason !== "stop" ||
      choice.message?.refusal ||
      !choice.message?.content
    ) {
      throw new Error("Incomplete model response");
    }
    return {
      output: parseJsonOrNull(choice.message.content),
      usage: body.usage,
      model,
    };
  };
  review.promptVersion = PROMPT_VERSION;
  return review;
}
