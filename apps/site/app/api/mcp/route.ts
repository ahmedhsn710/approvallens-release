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
  const server = new McpServer({ name: "approvallens", version: "0.4.0" });
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
