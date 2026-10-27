/** Conservative shell front end: parses literal commands, lists and pipelines.
 * Not an execution engine. Expansions/control structures abstain; no eval or shell
 * subprocess is used. Every branch is checked, regardless of short-circuiting.
 */
export type ShellCommand = {
  executable: string;
  args: string[];
  pipeInput: boolean;
};
export type ShellInspection = {
  kind: "inspection" | "unsupported";
  reason: string;
  code: string;
  commands: ShellCommand[];
  reads: string[];
};
type Token = { kind: "word" | "operator"; text: string };
class Unsupported extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
function fail(code: string, message: string): never {
  throw new Unsupported(code, message);
}
function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let word = "",
    started = false,
    quote = "";
  const flush = () => {
    if (started) tokens.push({ kind: "word", text: word });
    word = "";
    started = false;
  };
  for (let i = 0; i < source.length; i++) {
    const c = source[i]!;
    if (quote === "'") {
      if (c === "'") quote = "";
      else word += c;
      continue;
    }
    if (c === "\\") {
      const next = source[++i];
      if (!next || next === "\n")
        fail(
          "escape",
          "Trailing escapes and line continuations require a separate adapter.",
        );
      if (quote === '"' && !["$", "`", '"', "\\"].includes(next)) word += "\\";
      word += next;
      started = true;
      continue;
    }
    if (quote === '"') {
      if (c === '"') quote = "";
      else if (c === "$" || c === "`")
        fail(
          "expansion",
          "Parameter and command expansion cannot be resolved statically.",
        );
      else word += c;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      started = true;
      continue;
    }
    if (c === "$" || c === "`")
      fail(
        "expansion",
        "Parameter, arithmetic and command substitutions are not authorized.",
      );
    if ("*?[]{}~!".includes(c))
      fail(
        "expansion",
        "Globs, brace, tilde and history expansion are not authorized.",
      );
    if (c === "(" || c === ")")
      fail(
        "control-structure",
        "Subshells, functions and process substitutions need isolated execution.",
      );
    if (c === "<" || c === ">")
      fail(
        "redirection",
        "Redirection, here-documents and descriptor changes require an explicit effects adapter.",
      );
    if (c === "#" && !started) {
      while (i + 1 < source.length && source[i + 1] !== "\n") i++;
      continue;
    }
    if (c === " " || c === "\t") {
      flush();
      continue;
    }
    if (c === "\n" || c === ";" || c === "|" || c === "&") {
      flush();
      let op = c === "\n" ? ";" : c;
      if ((c === "|" || c === "&") && source[i + 1] === c) {
        op += c;
        i++;
      }
      if (op === "&")
        fail(
          "background",
          "Background jobs cannot be bound to a synchronous approval.",
        );
      tokens.push({ kind: "operator", text: op });
      continue;
    }
    word += c;
    started = true;
  }
  if (quote) fail("syntax", "Unterminated shell quote.");
  flush();
  if (tokens.length > 256) fail("bounds", "Too many shell tokens.");
  return tokens;
}
function parse(tokens: Token[]): ShellCommand[] {
  const commands: ShellCommand[] = [];
  let words: string[] = [],
    previous = "";
  function emit() {
    if (!words.length) fail("syntax", "Missing command around shell operator.");
    commands.push({
      executable: words[0]!,
      args: words.slice(1),
      pipeInput: previous === "|",
    });
    words = [];
    if (commands.length > 16)
      fail("bounds", "At most 16 commands may be inspected together.");
  }
  for (const token of tokens) {
    if (token.kind === "word") words.push(token.text);
    else {
      emit();
      previous = token.text;
    }
  }
  if (words.length) emit();
  else if (previous && previous !== ";")
    fail("syntax", "Incomplete pipeline or conditional list.");
  if (!commands.length) fail("syntax", "No command supplied.");
  return commands;
}
const binaries: Record<string, string> = Object.fromEntries(
  ["cat", "head", "tail", "wc", "grep", "pwd"].flatMap((name) =>
    ["/bin/", "/usr/bin/"].map((dir) => [dir + name, name]),
  ),
);
function inspectCommand(command: ShellCommand): string[] {
  const { executable, args, pipeInput } = command;
  const name = binaries[executable];
  if (!name) {
    const base = executable.split("/").at(-1)!;
    if (
      ["curl", "wget", "ssh", "scp", "sftp", "rsync", "nc", "ncat"].includes(
        base,
      )
    )
      fail(
        "network",
        "Network-capable commands need an authenticated destination and data-release adapter.",
      );
    if (
      [
        "rm",
        "mv",
        "cp",
        "mkdir",
        "rmdir",
        "touch",
        "chmod",
        "chown",
        "tee",
        "dd",
        "truncate",
        "install",
      ].includes(base)
    )
      fail(
        "mutation",
        "Filesystem mutation commands require explicit effect binding and human review; not authorized by inspection mode.",
      );
    if (["git", "hg", "svn"].includes(base))
      fail(
        "repository-execution",
        "Repository tools may invoke configuration, helpers, pagers or hooks; use a dedicated adapter.",
      );
    if (
      [
        "sh",
        "bash",
        "zsh",
        "fish",
        "python",
        "python3",
        "node",
        "ruby",
        "perl",
        "eval",
        "exec",
        "env",
        "sudo",
        "npm",
        "npx",
        "pnpm",
        "yarn",
        "pip",
        "make",
        "cargo",
        "go",
        "docker",
        "find",
        "xargs",
        "sed",
        "awk",
      ].includes(base)
    )
      fail(
        "code-execution",
        "Scripts, wrappers and execution-capable tools require an isolated execution adapter.",
      );
    if (!executable.startsWith("/"))
      fail(
        "executable-resolution",
        "Bare commands can resolve through aliases, functions or PATH. Use a supported absolute system executable.",
      );
    fail(
      "unknown-command",
      "No verified effects adapter exists for this executable.",
    );
  }
  if (name === "pwd") {
    if (args.length && !(args.length === 1 && ["-L", "-P"].includes(args[0]!)))
      fail("options", "Unsupported pwd options.");
    return [];
  }
  const files: string[] = [];
  let options = true,
    pattern = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (options && arg === "--") {
      options = false;
      continue;
    }
    if (options && arg.startsWith("-") && arg !== "-") {
      if (
        (name === "head" || name === "tail") &&
        (arg === "-n" || arg === "-c")
      ) {
        if (!/^\d{1,7}$/.test(args[++i] ?? ""))
          fail(
            "options",
            "head/tail counts must be bounded positive decimal literals.",
          );
        continue;
      }
      if ((name === "head" || name === "tail") && /^-[nc]\d{1,7}$/.test(arg))
        continue;
      const accepted =
        name === "cat"
          ? /^-[benstuv]+$/
          : name === "wc"
            ? /^-[clmw]+$/
            : name === "grep"
              ? /^-[Fniclvhsx]+$/
              : /^-[qv]+$/;
      if (!accepted.test(arg))
        fail(
          "options",
          "Unknown, recursive, file-loading, follow or execution-related options are not authorized.",
        );
      continue;
    }
    // BSD and GNU differ on option permutation: no options are accepted after operands.
    options = false;
    if (name === "grep" && !pattern) {
      if (arg.startsWith("-"))
        fail("options", "Use a literal non-option grep pattern.");
      pattern = true;
      continue;
    }
    if (!arg || (arg.startsWith("-") && arg !== "-"))
      fail("options", "Empty and option-like file operands are not supported.");
    if (arg === "-") {
      if (!pipeInput)
        fail("stdin", "Unbound standard input is not inspectable.");
    } else files.push(arg);
  }
  if (
    name === "grep" &&
    (!pattern || !args.some((a) => /^-[Fniclvhsx]*F[Fniclvhsx]*$/.test(a)))
  )
    fail(
      "options",
      "grep requires explicit -F fixed-string mode and a literal pattern.",
    );
  if (!files.length && !pipeInput)
    fail(
      "stdin",
      "A read command must name files or consume an inspected pipeline.",
    );
  return files;
}
export function inspectShell(command: unknown): ShellInspection {
  let commands: ShellCommand[] = [];
  try {
    if (
      typeof command !== "string" ||
      !command.trim() ||
      command.length > 4096 ||
      /[\x00-\x08\x0b-\x1f\x7f]/.test(command)
    )
      fail(
        "bounds",
        "Shell command is empty, oversized or contains control characters.",
      );
    commands = parse(tokenize(command));
    const reads = [...new Set(commands.flatMap(inspectCommand))];
    if (reads.length > 32)
      fail("bounds", "At most 32 files may be inspected per shell call.");
    return {
      kind: "inspection",
      code: "literal-read-only",
      reason:
        "All commands have supported read-only effects; file grants and data checks are still required.",
      commands,
      reads,
    };
  } catch (error) {
    return {
      kind: "unsupported",
      code: error instanceof Unsupported ? error.code : "analysis-failed",
      reason:
        error instanceof Unsupported
          ? error.message
          : "Shell analysis failed closed.",
      commands,
      reads: [],
    };
  }
}
