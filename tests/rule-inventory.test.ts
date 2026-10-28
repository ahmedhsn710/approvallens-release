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
it("includes deeper files and more than forty paths without a selection step", () => {
  const root = mkdtempSync(join(tmpdir(), "al-inventory-"));
  try {
    mkdirSync(join(root, "a/b/c/d/e/f"), { recursive: true });
    writeFileSync(join(root, "a/b/c/d/e/f/app.ts"), "");
    for (let i = 0; i < 60; i++) writeFileSync(join(root, `file-${i}.css`), "");
    const result = inventory(root);
    expect(result.paths).toHaveLength(61);
    expect(result.paths).toContain("a/b/c/d/e/f/app.ts");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
it("rejects oversized inventories instead of returning a truncated project", () => {
  const root = mkdtempSync(join(tmpdir(), "al-inventory-"));
  try {
    for (let i = 0; i < 801; i++) writeFileSync(join(root, `file-${i}.ts`), "");
    expect(() => inventory(root)).toThrow("No partial inventory was sent");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
it("collects bounded path metadata without following hidden, generated or symlink entries", () => {
  const root = mkdtempSync(join(tmpdir(), "al-inventory-"));
  try {
    for (const dir of ["src", ".private", "node_modules"])
      mkdirSync(join(root, dir));
    for (const file of [
      "Dockerfile",
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
    expect(result.paths).toEqual(["Dockerfile", "package.json", "src/main.ts"]);
    expect(result.stack).toEqual(["JavaScript", "TypeScript"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
