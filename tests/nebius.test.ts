import { afterEach, describe, expect, it, vi } from "vitest";
import { analyze } from "../packages/core/src/analyzer";
import { Request } from "../packages/core/src/contracts";
import { MAX_OUTPUT_TOKENS, nebiusReviewer } from "../packages/core/src/nebius";
import { pipeline } from "../packages/core/src/pipeline";
import {
  PROMPT_VERSION,
  REVIEW_SCHEMA_NAME,
} from "../packages/core/src/prompt";
import { readRequest, review, scope } from "./helpers";

const request = Request.parse({
  taskId: "t",
  developerIntent: "Update config",
  agentExplanation: "Write config.json",
  toolCall: {
    name: "write_file",
    args: { path: "config.json", content: "SYNTHETIC_PRIVATE_CONTENT" },
  },
});
const analysis = analyze(request, {
  grants: [{ operation: "write_file", path: "config.json" }],
  evidence: [{ path: "config.json", fields: { "/strict": "boolean" } }],
});

function configure() {
  vi.stubEnv("NEBIUS_API_KEY", "test-only");
  vi.stubEnv("NEBIUS_MODEL", "test-only-model");
  vi.stubEnv("NEBIUS_BASE_URL", "https://api.tokenfactory.nebius.com/v1/");
}

const completion = (
  content: string,
  finish_reason = "stop",
  extra: object = {},
) =>
  new Response(
    JSON.stringify({
      choices: [{ finish_reason, message: { content, ...extra } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }),
    { status: 200 },
  );

/** Explicit fetch double; tests never reach a provider. */
function stubFetch(
  respond: () => Response | Promise<Response> = () =>
    completion(JSON.stringify(review())),
) {
  const fake = vi.fn(async (..._args: unknown[]) => respond());
  vi.stubGlobal("fetch", fake);
  return fake;
}
const sentBody = (fake: ReturnType<typeof stubFetch>, call = 0) =>
  JSON.parse(String((fake.mock.calls[call]?.[1] as RequestInit).body));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("request construction", () => {
  it("sends safe field evidence to grounded review without raw file contents", async () => {
    configure();
    const fake = stubFetch();
    const input = Request.parse({
      ...request,
      toolCall: {
        name: "write_file",
        args: {
          path: "config.json",
          content: '{"strict":true,"private":"PRIVATE_VALUE"}',
        },
      },
    });
    const rich = analyze(
      input,
      {
        grants: [{ operation: "write_file", path: "config.json" }],
        evidence: [{ path: "config.json", fields: { "/strict": "boolean" } }],
      },
      {
        path: "config.json",
        before: '{"strict":false}',
        snapshot: { id: "snapshot", manifestHash: "a".repeat(64) },
      },
    );
    await nebiusReviewer("grounded")(input, rich);
    const body = sentBody(fake);
    const payload = JSON.parse(body.messages[1].content);
    expect(payload.effects[0].content.changes[0]).toMatchObject({
      id: "change-1",
      pointer: "/strict",
      after: { present: true, value: true },
    });
    expect(payload.effects[0].content.status).toBe("incomplete");
    expect(JSON.stringify(body)).not.toContain("PRIVATE_VALUE");
    expect(body.messages[0].content).toContain(
      "Incomplete content evidence requires unknown",
    );
  });

  it("sends a versioned strict schema, omits write contents, and records usage", async () => {
    configure();
    const fake = stubFetch();
    const reviewer = nebiusReviewer("grounded");
    const result = await reviewer(request, analysis);
    expect(result.usage).toEqual({ prompt_tokens: 10, completion_tokens: 5 });
    expect(reviewer.promptVersion).toBe(PROMPT_VERSION);

    const [url, options] = fake.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.href).toBe(
      "https://api.tokenfactory.nebius.com/v1/chat/completions",
    );
    expect(options.body).not.toContain("SYNTHETIC_PRIVATE_CONTENT");
    const body = sentBody(fake);
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema).toMatchObject({
      name: REVIEW_SCHEMA_NAME,
      strict: true,
    });
    expect(body.response_format.json_schema.schema.required).toEqual([
      "disclosure",
      "intent",
    ]);
    expect(body.messages[0].content).toContain("approvallens.review.v2");
    expect(body.max_tokens).toBe(MAX_OUTPUT_TOKENS);
  });

  it("instructs the model that faithful disclosure holds despite intent conflict", async () => {
    configure();
    const fake = stubFetch();
    await nebiusReviewer("raw")(request, analysis);
    const system = sentBody(fake).messages[0].content as string;
    expect(system).toContain(
      "even if the operation conflicts with developerIntent",
    );
    expect(system).toContain("Never use developerIntent to decide disclosure");
    expect(system).toContain("Do not use agentExplanation to decide intent");
  });

  it("compares raw and grounded fairly: only the user payload differs", async () => {
    configure();
    const fake = stubFetch();
    await nebiusReviewer("raw")(request, analysis);
    await nebiusReviewer("grounded")(request, analysis);
    const raw = sentBody(fake, 0);
    const grounded = sentBody(fake, 1);
    const { messages: rawMessages, ...rawRest } = raw;
    const { messages: groundedMessages, ...groundedRest } = grounded;
    expect(rawRest).toEqual(groundedRest); // model, temperature, budget, schema
    expect(rawMessages[0]).toEqual(groundedMessages[0]); // identical system prompt
    const rawUser = JSON.parse(rawMessages[1].content);
    const groundedUser = JSON.parse(groundedMessages[1].content);
    expect(Object.keys(rawUser).sort()).toEqual([
      "agentExplanation",
      "developerIntent",
      "toolCall",
    ]);
    expect(Object.keys(groundedUser).sort()).toEqual([
      "agentExplanation",
      "coverage",
      "developerIntent",
      "effects",
    ]);
    expect(rawUser.developerIntent).toBe(groundedUser.developerIntent);
    expect(rawUser.agentExplanation).toBe(groundedUser.agentExplanation);
  });
});

describe("provider and output failures", () => {
  it("rejects truncated output even when content is valid JSON", async () => {
    configure();
    stubFetch(() => completion("{}", "length"));
    await expect(nebiusReviewer("raw")(request, analysis)).rejects.toThrow(
      "Incomplete",
    );
  });

  it("rejects a refusal", async () => {
    configure();
    stubFetch(() =>
      completion(JSON.stringify(review()), "stop", { refusal: "no" }),
    );
    await expect(nebiusReviewer("raw")(request, analysis)).rejects.toThrow(
      "Incomplete",
    );
  });

  it("does not follow a configured non-Nebius endpoint", () => {
    configure();
    vi.stubEnv("NEBIUS_BASE_URL", "https://example.com/v1/");
    expect(() => nebiusReviewer("raw")).toThrow("official HTTPS");
  });

  it("does not include provider response text in errors", async () => {
    configure();
    stubFetch(() => new Response("private response", { status: 401 }));
    await expect(nebiusReviewer("raw")(request, analysis)).rejects.toThrow(
      "Nebius HTTP 401",
    );
  });

  it("classifies HTTP, network and truncation failures as reviewer_failed through the pipeline", async () => {
    configure();
    const failures: Array<() => Response | Promise<Response>> = [
      () => new Response("private", { status: 500 }),
      () => {
        throw new TypeError("network down");
      },
      () => completion("{}", "length"),
    ];
    for (const failure of failures) {
      stubFetch(failure);
      const r = await pipeline(
        readRequest(),
        scope,
        nebiusReviewer("grounded"),
      );
      expect(r.errorCategory).toBe("reviewer_failed");
      expect(r.versions.prompt).toBe(PROMPT_VERSION);
      expect(r.decision.outcome).toBe("review");
      expect(r.executable).toBe(false);
    }
  });

  it("classifies malformed JSON content as invalid_review, not a provider failure", async () => {
    configure();
    stubFetch(() => completion("not json {"));
    const r = await pipeline(readRequest(), scope, nebiusReviewer("grounded"));
    expect(r.errorCategory).toBe("invalid_review");
    expect(r.model).toBe("test-only-model");
    expect(JSON.stringify(r)).not.toContain("not json");
  });

  it("classifies schema-invalid JSON (legacy v1 shape) as invalid_review", async () => {
    configure();
    stubFetch(() =>
      completion(
        JSON.stringify({
          fidelity: "faithful",
          findings: [],
          unresolvedQuestions: [],
        }),
      ),
    );
    const r = await pipeline(readRequest(), scope, nebiusReviewer("raw"));
    expect(r.errorCategory).toBe("invalid_review");
  });

  it("accepts a valid v2 response end to end without granting execution", async () => {
    configure();
    stubFetch(() => completion(JSON.stringify(review())));
    const r = await pipeline(readRequest(), scope, nebiusReviewer("raw"));
    expect(r.error).toBeNull();
    expect(r.review?.disclosure.fidelity).toBe("faithful");
    expect(r.executable).toBe(false);
  });
});
