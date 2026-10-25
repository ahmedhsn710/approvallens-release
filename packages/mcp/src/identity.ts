import { createHash } from "node:crypto";
import { versions } from "../../core/src/pipeline";
import { JSON_EVIDENCE_VERSION } from "../../core/src/evidence/json-changes";
import { IntegrationPolicy } from "./policy";

/** Canonical object keys; policy array order remains significant. No credentials included. */
export const canonicalPolicy = (value: unknown): string =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]]),
        )
      : item,
  );
export const policyHash = (input: unknown) =>
  createHash("sha256")
    .update(canonicalPolicy(IntegrationPolicy.parse(input)))
    .digest("hex");
export const serviceIdentity = (policy: unknown) => ({
  policyHash: policyHash(policy),
  // Explicit compatibility identity, not a hash of every source byte.
  versions: {
    ...versions(null),
    evidence: JSON_EVIDENCE_VERSION,
    integration: "local-service-v3",
  },
});
