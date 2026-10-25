import { readFileSync } from "node:fs";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createIntegrationServer, IntegrationPolicy } from "./server";
import { createEvidenceProvider } from "./evidence";
const policyPath = process.env.APPROVALLENS_POLICY_FILE;
if (!policyPath)
  throw Error(
    "Set APPROVALLENS_POLICY_FILE to a developer-owned policy JSON file.",
  );
const raw = readFileSync(policyPath, "utf8");
if (Buffer.byteLength(raw) > 32768) throw Error("Policy exceeds 32 KiB.");
if (
  process.env.APPROVALLENS_MCP_MODE &&
  process.env.APPROVALLENS_MCP_MODE !== "rules-only"
)
  throw Error(
    "Local stdio release is rules-only. Use the native companion or hosted judge endpoint for configured live review.",
  );
const evidence = process.env.APPROVALLENS_WORKSPACE
  ? createEvidenceProvider(process.env.APPROVALLENS_WORKSPACE)
  : undefined;
await createIntegrationServer(
  IntegrationPolicy.parse(JSON.parse(raw)),
  undefined,
  evidence,
).connect(new StdioServerTransport());
