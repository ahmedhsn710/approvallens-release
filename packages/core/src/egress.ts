/** Deterministic outbound inspection. Never includes matched values in diagnostics. */
export class EgressBlocked extends Error {
  constructor(public readonly categories: string[]) {
    super(`Outbound data blocked: ${categories.join(", ")}`);
  }
}
const patterns: [string, RegExp][] = [
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  [
    "provider-token",
    /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16})\b/,
  ],
  [
    "credential-assignment",
    /(?:password|passwd|api[_-]?key|access[_-]?token|client[_-]?secret|authorization)\s*["']?\s*[:=]\s*["']?[^\s"',;}]{8,}/i,
  ],
  ["credential-url", /https?:\/\/[^\s/:]+:[^\s/@]+@/i],
  ["bearer-token", /\bBearer\s+[A-Za-z0-9_.~+\/-]{12,}/i],
];
export function assertOutboundSafe(
  value: unknown,
  blockedTerms: readonly string[] = [],
) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  if (!serialized || serialized.length > 1_100_000)
    throw new EgressBlocked(["uninspectable-payload"]);
  const strings: string[] = [serialized];
  let credentialField = false;
  function visit(item: unknown, depth = 0) {
    if (depth > 30) throw new EgressBlocked(["uninspectable-payload"]);
    if (typeof item === "string") strings.push(item);
    else if (item && typeof item === "object")
      for (const [key, child] of Object.entries(item)) {
        if (
          /^(password|passwd|api[_-]?key|access[_-]?token|client[_-]?secret|authorization)$/i.test(
            key,
          ) &&
          typeof child === "string" &&
          child.length > 0
        )
          credentialField = true;
        visit(child, depth + 1);
      }
  }
  visit(value);
  const text = strings.join("\n");

  const found = patterns
    .filter(([, pattern]) => pattern.test(text))
    .map(([name]) => name);
  if (
    blockedTerms.some(
      (term) => term && text.toLowerCase().includes(term.toLowerCase()),
    )
  )
    found.push("repository-blocked-term");
  if (credentialField) found.push("credential-field");
  if (found.length) throw new EgressBlocked(found);
}
