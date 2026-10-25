import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const child = spawn(
  process.execPath,
  [
    "--import",
    "tsx",
    fileURLToPath(
      new URL("../packages/companion/src/daemon.ts", import.meta.url),
    ),
    ...process.argv.slice(2),
  ],
  { cwd: root, stdio: "inherit" },
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));

child.on("error", () => {
  console.error("Unable to start ApprovalLens service.");
  process.exitCode = 1;
});
