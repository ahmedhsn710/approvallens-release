/** Plain-Node entry so a fresh checkout can install dependencies before tsx exists. */
import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../", import.meta.url));
const defaultCandidates = () => [
  "/Applications/Cursor.app/Contents/Resources/app/bin/cursor",
  join(homedir(), "Applications/Cursor.app/Contents/Resources/app/bin/cursor"),
];

export function needsInstall(root = repo) {
  return !existsSync(join(root, "node_modules", "tsx", "package.json"));
}

export function locateCursorCli(
  env = process.env,
  candidates = defaultCandidates(),
) {
  if (env.APPROVALLENS_DEMO_READY_NO_CURSOR === "1") return "skipped";
  const found = [];
  if (env.CURSOR_BIN) found.push(env.CURSOR_BIN);
  found.push(...candidates);
  for (const directory of (env.PATH ?? "").split(delimiter)) {
    if (directory) found.push(join(directory, "cursor"));
  }
  for (const candidate of found) {
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      /* try the next location */
    }
  }
  return null;
}

export function prerequisiteMessage(
  env = process.env,
  candidates = defaultCandidates(),
) {
  if (Number(process.versions.node.split(".")[0]) < 24)
    return "Node 24 is required. Install it from https://nodejs.org/ and open a new terminal.";
  if (process.platform === "win32")
    return "This demo runs on macOS or Linux. The checker uses a Unix socket.";
  if (!locateCursorCli(env, candidates))
    return "Cursor is required. Install it from https://cursor.com/download and run this command again.";
  return null;
}

function main() {
  const message = prerequisiteMessage();
  if (message) {
    console.error(message);
    process.exit(1);
  }
  if (needsInstall()) {
    const installed = spawnSync("npm", ["ci"], { cwd: repo, stdio: "inherit" });
    if (installed.status !== 0) process.exit(installed.status ?? 1);
  }
  const child = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      fileURLToPath(new URL("./demo-ready.ts", import.meta.url)),
      ...process.argv.slice(2),
    ],
    {
      cwd: repo,
      stdio: "inherit",
    },
  );
  process.exit(child.status ?? 1);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
