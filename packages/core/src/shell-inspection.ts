/** A complete parser for our tiny accepted language, NOT a general Bash parser.
 * Absolute executable paths avoid PATH lookup. No expansion, options, operators,
 * escaped characters, scripts, pipelines or multiple commands are accepted.
 */
export type ShellInspection =
  | { kind: "pwd" }
  | { kind: "read"; path: string }
  | { kind: "unsupported"; reason: string };
export function inspectShell(command: unknown): ShellInspection {
  if (
    typeof command !== "string" ||
    command.length > 4096 ||
    /[\x00-\x1f\x7f$`\\;&|<>(){}*?!#~]/.test(command)
  )
    return {
      kind: "unsupported",
      reason:
        "Shell expansions, operators or control characters are unsupported.",
    };
  if (command === "/bin/pwd") return { kind: "pwd" };
  const match = /^\/bin\/cat (?:'([^']+)'|([A-Za-z0-9_./-]+))$/.exec(command);
  const path = match?.[1] ?? match?.[2];
  if (path && !path.startsWith("-") && !path.includes('"'))
    return { kind: "read", path };
  return {
    kind: "unsupported",
    reason:
      "Only /bin/pwd and /bin/cat with one literal file path are supported.",
  };
}
