import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolve, join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createIntegrationServer } from "../packages/mcp/src/server";

const policy = {
  version: 1 as const,
  taskId: "test",
  developerIntent: "Read package.json",
  grants: [{ operation: "read_file" as const, path: "package.json" }],
};
describe("MCP advisory boundary", () => {
  it("exposes only review, denies deletion and rejects tool-supplied scope", async () => {
    const server = createIntegrationServer(policy);
    const client = new Client({ name: "test-client", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    await client.connect(b);
    try {
      expect((await client.listTools()).tools.map((t) => t.name)).toEqual([
        "approvallens_review",
      ]);
      const result = await client.callTool({
        name: "approvallens_review",
        arguments: {
          toolCall: { name: "delete_file", args: { path: "package.json" } },
          agentExplanation: "Read package.json.",
        },
      });
      expect(result.structuredContent).toMatchObject({
        assessment: { executionAuthorized: false, permission: "denied" },
        advisoryOnly: true,
        executable: false,
        semanticReview: "NOT_MEASURED",
        decision: { scope: { status: "denied" } },
      });
      const forged = await client.callTool({
        name: "approvallens_review",
        arguments: {
          toolCall: { name: "read_file", args: { path: "package.json" } },
          agentExplanation: "Read",
          grants: [{ operation: "delete_file", path: "package.json" }],
        },
      });
      expect(forged.isError).toBe(true);
    } finally {
      await client.close();
      await server.close();
    }
  });
  it("initializes and reviews through actual stdio with clean protocol output", async () => {
    const client = new Client({ name: "stdio-test", version: "1" });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "tsx", resolve("packages/mcp/src/stdio.ts")],
      cwd: process.cwd(),
      env: { APPROVALLENS_POLICY_FILE: resolve("examples/policy.json") },
      stderr: "pipe",
    });
    try {
      await client.connect(transport);
      const result = await client.callTool({
        name: "approvallens_review",
        arguments: {
          toolCall: { name: "read_file", args: { path: "package.json" } },
          agentExplanation: "Read package.json.",
        },
      });
      expect(result.structuredContent).toMatchObject({
        executable: false,
        decision: { scope: { status: "permitted" } },
      });
    } finally {
      await client.close();
    }
  });
  it("refuses unsupported LIVE stdio mode before exposing any tools", async () => {
    const client = new Client({ name: "unsupported-mode-test", version: "1" });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "tsx", resolve("packages/mcp/src/stdio.ts")],
      cwd: process.cwd(),
      env: {
        APPROVALLENS_POLICY_FILE: resolve("examples/policy.json"),
        APPROVALLENS_MCP_MODE: "live",
      },
      stderr: "pipe",
    });
    try {
      await expect(client.connect(transport)).rejects.toThrow();
    } finally {
      await client.close();
    }
  });
});
