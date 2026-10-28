import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { it, expect } from "vitest";
const { inventory } = createRequire(import.meta.url)(
  "../packages/extension/inventory.cjs",
);
it("collects bounded path metadata without following hidden, generated or symlink entries", () => {
  const root = mkdtempSync(join(tmpdir(), "al-inventory-"));
  try {
    for (const dir of ["src", ".private", "node_modules"])
      mkdirSync(join(root, dir));
    for (const file of [
      "package.json",
      "src/main.ts",
      "src/secrets.json",
      ".private/config.json",
      "node_modules/dependency.js",
    ])
      writeFileSync(
        join(root, file),
        "not valid JSON; inventory must not parse contents",
      );
    symlinkSync(join(root, ".private"), join(root, "linked"));
    const result = inventory(root);
    expect(result.paths).toEqual(["package.json", "src/main.ts"]);
    expect(result.stack).toEqual(["JavaScript", "TypeScript"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
