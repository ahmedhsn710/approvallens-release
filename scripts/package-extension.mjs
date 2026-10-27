import "./build-extension.mjs";
import { readFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const extension = join(root, "packages/extension");
const { version } = JSON.parse(
  readFileSync(join(extension, "package.json"), "utf8"),
);
if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error("Invalid release version");
mkdirSync(join(root, "artifacts"), { recursive: true });
const result = spawnSync(
  process.execPath,
  [
    join(root, "node_modules/@vscode/vsce/vsce"),
    "package",
    "--no-dependencies",
    "--out",
    join(root, "artifacts", `approvallens-cursor-${version}.vsix`),
  ],
  { cwd: extension, stdio: "inherit" },
);
process.exitCode = result.status ?? 1;
