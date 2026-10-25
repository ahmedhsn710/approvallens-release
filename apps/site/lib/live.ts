import { timingSafeEqual } from "node:crypto";
import { nebiusReviewer } from "../../../packages/core/src/nebius";
import type { SemanticBackend } from "../../../packages/mcp/src/core";

export function authorized(request: Request): boolean {
  const expected = process.env.APPROVALLENS_JUDGE_TOKEN;
  const provided = request.headers
    .get("authorization")
    ?.replace(/^Bearer /, "");
  if (!expected || !provided) return false;
  const a = Buffer.from(expected),
    b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}
/** Atomic durable admission. A timeout is never refunded or retried. */
export async function reserveRemoteCall(): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL,
    token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const limit = Number(process.env.APPROVALLENS_MAX_LIVE_CALLS ?? "0");
  if (
    !url ||
    !token ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100
  )
    return false;
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".upstash.io"))
    return false;
  const script =
    "local n=tonumber(redis.call('GET',KEYS[1]) or '0'); if n>=tonumber(ARGV[1]) then return 0 end; redis.call('INCR',KEYS[1]); return 1";
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      "EVAL",
      script,
      "1",
      "approvallens:hosted:v1:reservations",
      String(limit),
    ]),
    signal: AbortSignal.timeout(5000),
    cache: "no-store",
  });
  if (!response.ok) return false;
  const data = await response.json();
  return data.result === 1;
}
export function liveBackend(admitted: boolean): SemanticBackend {
  if (process.env.NEBIUS_MODEL !== "nvidia/nemotron-3-super-120b-a12b")
    throw Error("Verified Nemotron model required");
  let unused = admitted;
  return {
    reviewer: nebiusReviewer("grounded"),
    reserve: () => {
      const value = unused;
      unused = false;
      return value;
    },
  };
}
