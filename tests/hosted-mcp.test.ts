import { afterEach, describe, expect, it, vi } from "vitest";
import { POST, GET } from "../apps/site/app/api/mcp/route";
import { scenes } from "../apps/site/lib/demo";
import { reserveRemoteCall } from "../apps/site/lib/live";
function request(
  method: string,
  params: unknown = {},
  headers: Record<string, string> = {},
) {
  return new Request("https://review.example/api/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("hosted MCP release boundary", () => {
  it("initializes over Streamable HTTP and exposes only advisory tools", async () => {
    const init = await POST(
      request("initialize", {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test", version: "1" },
      }),
    );
    expect(init.status).toBe(200);
    expect((await init.json()).result.serverInfo.name).toBe("approvallens");
    const listing = await POST(request("tools/list"));
    expect(
      (await listing.json()).result.tools.map((t: { name: string }) => t.name),
    ).toEqual(["approvallens_examples", "approvallens_review"]);
  });
  it("preserves the server-owned baseline and denies the hidden protected change", async () => {
    const { toolCall, agentExplanation } = scenes[1];
    const response = await POST(
      request("tools/call", {
        name: "approvallens_review",
        arguments: { toolCall, agentExplanation },
      }),
    );
    const result = (await response.json()).result.structuredContent;
    expect(result).toMatchObject({
      mode: "RULES_ONLY",
      executable: false,
      environment: "hosted-synthetic-fixture",
      decision: { outcome: "block" },
    });
  });
  it("cannot accept caller-owned policies or grant execution", async () => {
    const { toolCall, agentExplanation } = scenes[0];
    const response = await POST(
      request("tools/call", {
        name: "approvallens_review",
        arguments: {
          toolCall,
          agentExplanation,
          grants: [{ operation: "delete_file", path: ".env" }],
        },
      }),
    );
    expect((await response.json()).result.isError).toBe(true);
  });
  it("rejects cross-origin calls, invalid credentials and oversized requests", async () => {
    expect(
      (
        await POST(
          request("tools/list", {}, { origin: "https://evil.example" }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await POST(
          request("tools/list", {}, { authorization: "Bearer invalid" }),
        )
      ).status,
    ).toBe(401);
    expect(
      (await POST(request("tools/list", {}, { "content-length": "32769" })))
        .status,
    ).toBe(413);
    expect(GET().status).toBe(405);
  });
  it("does not dispatch to a model for a deterministic denial even with judge credentials", async () => {
    vi.stubEnv("APPROVALLENS_JUDGE_TOKEN", "test-judge");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const { toolCall, agentExplanation } = scenes[1];
    const response = await POST(
      request(
        "tools/call",
        {
          name: "approvallens_review",
          arguments: { toolCall, agentExplanation },
        },
        { authorization: "Bearer test-judge" },
      ),
    );
    expect(
      (await response.json()).result.structuredContent.decision.outcome,
    ).toBe("block");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("fails closed when persistent model budget is not configured", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("APPROVALLENS_JUDGE_TOKEN", "test-judge");
    const { toolCall, agentExplanation } = scenes[0];
    const response = await POST(
      request(
        "tools/call",
        {
          name: "approvallens_review",
          arguments: { toolCall, agentExplanation },
        },
        { authorization: "Bearer test-judge" },
      ),
    );
    expect((await response.json()).result.isError).toBe(true);
  });
  it("uses an atomic durable reservation and never retries ambiguous failures", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://test.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test");
    vi.stubEnv("APPROVALLENS_MAX_LIVE_CALLS", "1");
    let remaining = 1;
    const fetcher = vi.fn(async (_url: unknown, options: RequestInit) => {
      expect(JSON.parse(String(options.body))[0]).toBe("EVAL");
      return Response.json({ result: remaining-- > 0 ? 1 : 0 });
    });
    vi.stubGlobal("fetch", fetcher);
    expect(
      (await Promise.all([reserveRemoteCall(), reserveRemoteCall()])).filter(
        Boolean,
      ),
    ).toHaveLength(1);
    fetcher.mockRejectedValueOnce(new Error("timeout"));
    await expect(reserveRemoteCall()).rejects.toThrow("timeout");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
