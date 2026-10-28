import { assertOutboundSafe } from "../../../../../packages/core/src/egress";
import {
  RuleSuggestionInput,
  suggestRules,
} from "../../../../../packages/mcp/src/rule-suggestions";
import {
  RemoteReviewInput,
  remoteAnalysis,
} from "../../../../../packages/mcp/src/remote-review";
import { validateReview } from "../../../../../packages/core/src/contracts";
import { nebiusReviewer } from "../../../../../packages/core/src/nebius";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  hostedInput,
  reviewDemo,
  scenes,
  demoPolicy,
  baseline,
} from "../../../lib/demo";
import { authorized, reserveRemoteCall, liveBackend } from "../../../lib/live";
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return new Response("Origin not allowed", { status: 403 });
  if (request.headers.has("authorization") && !authorized(request))
    return new Response("Invalid judge credential", { status: 401 });
  if (Number(request.headers.get("content-length") || 0) > 32768)
    return new Response("Request too large", { status: 413 });
  // Bound bytes while reading, including requests without Content-Length.
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 32768) {
          await reader.cancel();
          return new Response("Request too large", { status: 413 });
        }
        chunks.push(value);
      }
    }
  } catch {
    return new Response("Invalid body", { status: 400 });
  } finally {
    reader?.releaseLock();
  }
  const text = Buffer.concat(chunks).toString("utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const live = authorized(request);
  const server = new McpServer({ name: "approvallens", version: "0.7.1" });
  if (live)
    server.registerTool(
      "approvallens_suggest_rules",
      {
        description:
          "Suggest an unapplied policy draft from automatically collected project paths and intent. No file contents, execution or automatic application.",
        inputSchema: RuleSuggestionInput,
      },
      async (input) => {
        try {
          assertOutboundSafe(input);
          if (!(await reserveRemoteCall())) throw Error("Budget unavailable");
          const result = await suggestRules(input);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result) }],
            structuredContent: result,
          };
        } catch {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: "Rule suggestion unavailable. No policy was applied.",
              },
            ],
          };
        }
      },
    );
  if (live)
    server.registerTool(
      "approvallens_review_evidence",
      {
        description:
          "Review client-observed repository evidence. Advisory only; no filesystem access or execution authority.",
        inputSchema: RemoteReviewInput,
      },
      async (input) => {
        try {
          if (
            input.request.toolCall.name === "write_file" &&
            input.request.toolCall.args.content !== "[CONTENT OMITTED]"
          )
            throw Error("Raw content not accepted");
          if (
            input.analysis.violations.length ||
            input.analysis.coverage !== "complete"
          )
            throw Error("Local policy checks required");
          if (process.env.NEBIUS_MODEL !== "nvidia/nemotron-3-super-120b-a12b")
            throw Error("Unsupported model");
          assertOutboundSafe(input);
          if (!(await reserveRemoteCall())) throw Error("Budget unavailable");
          const analysis = remoteAnalysis(input);
          const result = await nebiusReviewer("grounded")(
            input.request,
            analysis,
          );
          validateReview(result.output, analysis);
          const output = {
            ...result,
            executable: false,
            evidenceSource: "client-observed",
          };
          return {
            content: [{ type: "text" as const, text: JSON.stringify(output) }],
            structuredContent: output,
          };
        } catch {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: "Review unavailable or invalid. No approval issued.",
              },
            ],
          };
        }
      },
    );
  server.registerTool(
    "approvallens_examples",
    {
      description:
        "Get the immutable hosted sample policy, baseline and three judge test cases. No repository access or execution.",
      inputSchema: {},
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            mode: live ? "LIVE_REQUESTED" : "RULES_ONLY",
            policy: demoPolicy,
            baseline,
            scenes,
          }),
        },
      ],
    }),
  );
  server.registerTool(
    "approvallens_review",
    {
      description:
        "Review a proposed action against the immutable hosted settings sample. Advisory only; never executes or approves. NOT your local repository. Optional judge credential enables bounded Nebius review; hard denials skip inference.",
      inputSchema: hostedInput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: live,
        idempotentHint: !live,
      },
    },
    async (input) => {
      const preliminary = await reviewDemo(input);
      if (!live || preliminary.semanticSkipReason)
        return {
          content: [{ type: "text", text: JSON.stringify(preliminary) }],
          structuredContent: preliminary,
        };
      try {
        if (!(await reserveRemoteCall()))
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: "Live budget unavailable or exhausted. No model call or approval occurred.",
              },
            ],
          };
        const result = await reviewDemo(input, liveBackend(true));
        return {
          isError: !!result.error,
          content: [{ type: "text", text: JSON.stringify(result) }],
          structuredContent: result,
        };
      } catch {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Live review unavailable. No approval issued.",
            },
          ],
        };
      }
    },
  );
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  try {
    await server.connect(transport);
    return await transport.handleRequest(request, { parsedBody: parsed });
  } finally {
    await server.close();
  }
}
export function GET() {
  return new Response(
    "Connect using an MCP client with Streamable HTTP POST. See /guide.",
    { status: 405, headers: { Allow: "POST" } },
  );
}
export const DELETE = GET;
