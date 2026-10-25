/** One-command rules-only settings demo. Never approves a write or calls a model. */
import { spawn, spawnSync } from "node:child_process";
import { constants } from "node:fs";
import {
  accessSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const repo = fileURLToPath(new URL("../", import.meta.url));
const extensionDir = join(repo, "packages", "extension");

export function locateCursor(
  options: { pathEnv?: string; candidates?: string[]; envBin?: string } = {},
): string | null {
  const explicit = options.envBin ?? process.env.CURSOR_BIN;
  const candidates = [
    ...(explicit ? [explicit] : []),
    ...(options.candidates ?? [
      "/Applications/Cursor.app/Contents/Resources/app/bin/cursor",
      join(
        homedir(),
        "Applications/Cursor.app/Contents/Resources/app/bin/cursor",
      ),
    ]),
  ];
  const pathEnv = options.pathEnv ?? process.env.PATH ?? "";
  for (const directory of pathEnv.split(delimiter)) {
    if (directory) candidates.push(join(directory, "cursor"));
  }
  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      /* try the next location */
    }
  }
  return null;
}

export function judgeSteps(input: {
  workspace: string;
  vsix: string;
  serviceLog: string;
  servicePid: string;
  cli: string | null;
}): string {
  const open = input.cli
    ? "The extension install was requested and the sample folder was opened."
    : [
        "The Cursor command-line tool was not found. Finish these two steps, then continue below.",
        `Install the extension: cursor --install-extension '${input.vsix}' --force`,
        `Open only this folder: cursor '${input.workspace}'`,
      ].join("\n");
  return [
    "The checker is running in rules-only mode. This command did not approve a write and did not call a model.",
    open,
    "1. Trust the folder if Cursor asks.",
    "2. Reload the window only if ApprovalLens shield → Activity does not show the prompts.",
    "3. Click a prompt in the shield to copy it, then paste it into chat. Run one prompt at a time:",
    "   Use Read to read package.json. Do not use terminal or search.",
    '   Use Write to replace settings.json with {"compilerOptions":{"strict":true,"retries":1}}. Do not use partial edits or other tools.',
    '   Use Write to replace settings.json with {"compilerOptions":{"strict":true,"retries":2}}. Do not use other tools.',
    "   Use Shell to run echo ApprovalLens-demo.",
    "4. On the safe write, click Approve once yourself within 100 seconds.",
    `Service log: ${input.serviceLog}`,
    `Stop the checker later with: kill $(cat '${input.servicePid}')`,
  ].join("\n");
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function waitForSocket(socket: string) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (existsSync(socket)) return;
    await delay(250);
  }
  throw Error(`The checker did not open its socket: ${socket}`);
}

function startService(config: string, state: string) {
  const logPath = join(state, "service.log");
  const pidPath = join(state, "service.pid");
  const log = openSync(logPath, "a");
  const child = spawn(
    process.execPath,
    [join(repo, "scripts/cursor-service.mjs"), config, state],
    {
      detached: true,
      stdio: ["ignore", log, log],
    },
  );
  child.unref();
  if (!child.pid) throw Error("The checker process did not start.");
  writeFileSync(pidPath, `${child.pid}\n`, { mode: 0o600 });
  return { logPath, pidPath };
}

export async function runDemoReady(argv = process.argv.slice(2)) {
  if (Number(process.versions.node.split(".")[0]) < 24)
    fail(
      "Node 24 is required. Install it from https://nodejs.org/ and open a new terminal.",
    );
  if (process.platform === "win32")
    fail("This demo runs on macOS or Linux. The checker uses a Unix socket.");
  if (argv.length > 1) fail("Usage: npm run demo:ready -- [new-directory]");
  const skipCursor = process.env.APPROVALLENS_DEMO_READY_NO_CURSOR === "1";
  const cli = skipCursor ? null : locateCursor();
  if (!skipCursor && !cli)
    fail(
      "Cursor is required. Install it from https://cursor.com/download and run this command again.",
    );
  const destination = resolve(argv[0] ?? join(homedir(), "al-demo-settings"));
  const version = JSON.parse(
    readFileSync(join(extensionDir, "package.json"), "utf8"),
  ).version as string;
  const vsix =
    process.env.APPROVALLENS_DEMO_READY_VSIX ??
    join(repo, "artifacts", `approvallens-cursor-${version}-judge.vsix`);
  if (!process.env.APPROVALLENS_DEMO_READY_VSIX) {
    mkdirSync(join(repo, "artifacts"), { recursive: true });
    const packaged = spawnSync(
      "npx",
      ["--no-install", "vsce", "package", "--no-dependencies", "--out", vsix],
      {
        cwd: extensionDir,
        stdio: "inherit",
      },
    );
    if (packaged.status !== 0) fail("Extension packaging failed.");
  } else if (!existsSync(vsix)) fail(`Extension package not found: ${vsix}`);

  const setup = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      join(repo, "scripts/demo-setup.ts"),
      destination,
      "--profile",
      "settings",
    ],
    { encoding: "utf8" },
  );
  if (setup.status !== 0) fail(setup.stderr || "Sample setup failed.");
  const created = JSON.parse(setup.stdout) as {
    workspace: string;
    config: string;
    socket: string;
  };
  const state = dirname(created.config);
  if (cli) {
    const installed = spawnSync(cli, ["--install-extension", vsix, "--force"], {
      encoding: "utf8",
    });
    if (installed.status !== 0)
      console.error(
        installed.stderr ||
          "Extension install failed. Use the printed install command.",
      );
  }
  const service = startService(created.config, state);
  try {
    await waitForSocket(created.socket);
  } catch (error) {
    const log = existsSync(service.logPath)
      ? readFileSync(service.logPath, "utf8")
      : "";
    fail(
      `${error instanceof Error ? error.message : "Checker failed to start."}\n${log}`,
    );
  }
  if (cli) {
    const opened = spawnSync(cli, [created.workspace], { encoding: "utf8" });
    if (opened.status !== 0)
      console.error(
        opened.stderr ||
          "Cursor did not open the sample. Use the printed open command.",
      );
  }
  const doctor = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      join(repo, "packages/companion/src/doctor.ts"),
      created.config,
      state,
    ],
    { encoding: "utf8" },
  );
  console.log(
    judgeSteps({
      workspace: created.workspace,
      vsix,
      serviceLog: service.logPath,
      servicePid: service.pidPath,
      cli,
    }),
  );
  if (doctor.stdout) console.log(doctor.stdout);
  if (doctor.status !== 0) process.exitCode = doctor.status ?? 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await runDemoReady();
}
