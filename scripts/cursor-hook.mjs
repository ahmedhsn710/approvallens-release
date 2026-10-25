// Cursor hook transport only: decisions come from the shared local service.
import { appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createConnection } from "node:net";
const socket = process.argv[2];
let raw = "";
let event;
try {
  for await (const chunk of process.stdin) {
    raw += chunk;
    if (Buffer.byteLength(raw) > 65536) throw Error("limit");
  }
  event = JSON.parse(raw);
  // Metadata-only ingress receipt distinguishes missing Cursor events from controller rejection.
  // Never persist query strings, arguments, model messages, or tool output.
  const known = [
    "Read",
    "Write",
    "Delete",
    "Grep",
    "Shell",
    "Task",
    "WebSearch",
    "WebFetch",
  ];
  appendFileSync(
    join(dirname(socket), "hook-receipts.jsonl"),
    JSON.stringify({
      at: new Date().toISOString(),
      event: ["preToolUse", "postToolUse", "postToolUseFailure"].includes(
        event.hook_event_name,
      )
        ? event.hook_event_name
        : "other",
      tool: known.includes(event.tool_name) ? event.tool_name : "other",
    }) + "\n",
    { mode: 0o600 },
  );
  const result = await new Promise((resolve, reject) => {
    const client = createConnection(socket);
    let data = "";
    client.setTimeout(115000, () => client.destroy(Error("timeout")));
    client.on("connect", () =>
      client.write(JSON.stringify({ method: "event", event }) + "\n"),
    );
    client.on("data", (chunk) => {
      data += chunk;
      if (data.length > 65536) client.destroy(Error("limit"));
    });
    client.on("error", reject);
    client.on("end", () => {
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
  });
  if (!result.ok) throw Error("rejected");
  console.log(JSON.stringify(result.result));
} catch {
  console.log(
    JSON.stringify(
      event?.hook_event_name === "preToolUse" || !event
        ? {
            permission: "deny",
            user_message:
              "ApprovalLens unavailable or unsupported event. Action denied.",
            agent_message: "Do not retry automatically.",
          }
        : {},
    ),
  );
  process.exitCode = 2;
}
