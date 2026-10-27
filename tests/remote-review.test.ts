import { describe, it, expect, vi, afterEach } from "vitest";
import { remoteReviewer } from "../packages/mcp/src/remote-review";
import { POST } from "../apps/site/app/api/mcp/route";
const request = {
  taskId: "test",
  developerIntent: "Update package",
  agentExplanation: "Update package",
  toolCall: {
    name: "write_file" as const,
    args: { path: "package.json", content: "SECRET BODY" },
  },
};
const analysis = {
  effects: [
    {
      id: "e1",
      kind: "file_write" as const,
      resource: "package.json",
      evidence: "Proposed write",
      certainty: "direct" as const,
    },
  ],
  coverage: "complete" as const,
  risk: "low" as const,
  violations: [],
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("remote native reviewer boundary", () => {
  it("omits raw content and rejects failed remote reviews", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ result: { isError: true } }), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetch);
    await expect(remoteReviewer("private")(request, analysis)).rejects.toThrow(
      "Hosted review failed",
    );
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.params.arguments.request.toolCall.args.content).toBe(
      "[CONTENT OMITTED]",
    );
    expect(JSON.stringify(body)).not.toContain("SECRET BODY");
  });
  it("validates a successful model response without granting execution", async () => {
    const output = {
      disclosure: {
        fidelity: "faithful",
        findings: [],
        unresolvedQuestions: [],
      },
      intent: { alignment: "aligned", findings: [], unresolvedQuestions: [] },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              result: {
                structuredContent: {
                  output,
                  model: "nvidia/nemotron-3-super-120b-a12b",
                  executable: false,
                },
              },
            }),
          ),
      ),
    );
    const result = await remoteReviewer("private")(request, analysis);
    expect(result.output).toEqual(output);
    expect(result).not.toHaveProperty("executionAuthorized");
  });
  it("rejects another endpoint", () => {
    expect(() => remoteReviewer("private", "https://evil.example")).toThrow();
  });
  it("only advertises native evidence reviews to authenticated clients", async () => {
    vi.stubEnv("APPROVALLENS_JUDGE_TOKEN", "private");
    const response = await POST(
      new Request("https://review.example/api/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: "Bearer private",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      }),
    );
    expect(
      (await response.json()).result.tools.map((t: any) => t.name),
    ).toContain("approvallens_review_evidence");
  });
  it("rejects raw contents before reserving a model call", async () => {
    vi.stubEnv("APPROVALLENS_JUDGE_TOKEN", "private");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const response = await POST(
      new Request("https://review.example/api/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: "Bearer private",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "approvallens_review_evidence",
            arguments: { request, analysis },
          },
        }),
      }),
    );
    expect((await response.json()).result.isError).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
});
