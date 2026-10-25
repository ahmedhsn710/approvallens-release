import { loadEnvFile } from "node:process";
import { isAbsolute, relative } from "node:path";
import { realpathSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { validateReview } from "../../core/src/contracts";
import { nebiusReviewer } from "../../core/src/nebius";
import type { SemanticBackend } from "../../mcp/src/core";

/** A separate native-call ledger: persistent reservations are never refunded. */
export function nativeLiveBackend(
  db: Database.Database,
  workspace: string,
  settings: { maxCalls: number; envFile?: string },
): SemanticBackend {
  if (settings.envFile) {
    if (!isAbsolute(settings.envFile))
      throw Error("Absolute provider env file required");
    const rel = relative(
      realpathSync(workspace),
      realpathSync(settings.envFile),
    );
    if (!rel || (!rel.startsWith("..") && !isAbsolute(rel)))
      throw Error("Provider env file must be outside inspected workspace");
    loadEnvFile(settings.envFile);
  }
  if (process.env.NEBIUS_MODEL !== "nvidia/nemotron-3-super-120b-a12b")
    throw Error("Verified Nemotron model required");
  const provider = nebiusReviewer("grounded");
  db.exec(
    "CREATE TABLE IF NOT EXISTS native_live_halt (id INTEGER PRIMARY KEY CHECK(id=1), reason TEXT NOT NULL)",
  );
  const reviewer: SemanticBackend["reviewer"] = Object.assign(
    async (...args: Parameters<SemanticBackend["reviewer"]>) => {
      const result = await provider(...args);
      try {
        validateReview(result.output, args[1]);
      } catch {
        db.prepare(
          "INSERT OR IGNORE INTO native_live_halt VALUES (1, 'invalid_review')",
        ).run();
      }
      return result; // The pipeline still validates and makes the decision.
    },
    { promptVersion: provider.promptVersion },
  );
  db.exec(
    "CREATE TABLE IF NOT EXISTS native_live_reservations (id TEXT PRIMARY KEY, at TEXT NOT NULL)",
  );
  return {
    reviewer,
    halted: () =>
      Boolean(db.prepare("SELECT id FROM native_live_halt WHERE id=1").get()),
    reserve: () =>
      db
        .transaction(() => {
          if (db.prepare("SELECT id FROM native_live_halt WHERE id=1").get())
            return false;
          const { n } = db
            .prepare("SELECT count(*) AS n FROM native_live_reservations")
            .get() as { n: number };
          if (n >= settings.maxCalls) return false;
          db.prepare("INSERT INTO native_live_reservations VALUES (?,?)").run(
            randomUUID(),
            new Date().toISOString(),
          );
          return true;
        })
        .immediate(),
  };
}
