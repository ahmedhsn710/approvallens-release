/** Run against a local or deployed public endpoint. Never supplies LIVE credentials. */
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const endpoint = new URL(process.argv[2] || "http://127.0.0.1:3107/api/mcp");
const client = new Client({
  name: "approvallens-release-smoke",
  version: "0.4.0",
});
try {
  await client.connect(new StreamableHTTPClientTransport(endpoint));
  assert.deepEqual(
    (await client.listTools()).tools.map((t) => t.name),
    ["approvallens_examples", "approvallens_review"],
  );
  const examples = await client.callTool({
    name: "approvallens_examples",
    arguments: {},
  });
  const sample = JSON.parse(examples.content[0].text);
  assert.equal(sample.mode, "RULES_ONLY");
  for (const scene of sample.scenes) {
    const response = await client.callTool({
      name: "approvallens_review",
      arguments: {
        toolCall: scene.toolCall,
        agentExplanation: scene.agentExplanation,
      },
    });
    assert.ok(!response.isError);
    const result = response.structuredContent;
    assert.equal(result.executable, false);
    assert.equal(result.mode, "RULES_ONLY");
    if (scene.id !== "safe-change")
      assert.equal(result.decision.outcome, "block");
    console.log(
      JSON.stringify({
        scene: scene.id,
        mode: result.mode,
        outcome: result.decision.outcome,
        executionAuthorized: result.approval.executionAuthorized,
      }),
    );
  }
  console.log(
    "Hosted MCP initialization, discovery and three review scenarios passed.",
  );
} finally {
  await client.close();
}
