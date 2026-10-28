import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const out = `${root}packages/extension/dist`;
mkdirSync(out, { recursive: true });
await build({
  entryPoints: [`${root}packages/companion/src/extension-daemon.ts`],
  outfile: `${out}/companion.cjs`,
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
});
await build({
  entryPoints: [`${root}packages/mcp/src/policy.ts`],
  outfile: `${out}/policy.cjs`,
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
});
await build({
  entryPoints: [`${root}packages/mcp/src/rule-suggestions.ts`],
  outfile: `${out}/rule-suggestions.cjs`,
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
});
await build({
  entryPoints: [`${root}packages/core/src/egress.ts`],
  outfile: `${out}/egress.cjs`,
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
});
await build({
  entryPoints: [`${root}scripts/cursor-hook.mjs`],
  outfile: `${out}/hook.mjs`,
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
});
