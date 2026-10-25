import { createHash } from "node:crypto";
import {
  lstatSync,
  realpathSync,
  openSync,
  closeSync,
  fstatSync,
  readSync,
  constants,
} from "node:fs";
import { resolve } from "node:path";
import { isNormalizedRelativePath } from "../../core/src/scope";
import type { ToolCall } from "../../core/src/contracts";
import type { JsonEvidenceContext } from "../../core/src/evidence/json-changes";

export type EvidenceProvider = (
  call: ToolCall,
  entry: import("../../core/src/scope").EvidenceEntry,
) => JsonEvidenceContext | undefined;
/** Developer-owned local observation; comparison rules are exclusively stored in policy. */
export function createEvidenceProvider(workspace: string): EvidenceProvider {
  if (lstatSync(workspace).isSymbolicLink())
    throw Error("Evidence workspace symlink forbidden");
  const root = realpathSync(workspace);
  return (call, rule) => {
    if (call.name !== "write_file" && call.name !== "delete_file")
      return undefined;
    if (rule.path !== call.args.path || !isNormalizedRelativePath(rule.path))
      return undefined;
    let target = root;
    for (const segment of rule.path.split("/")) {
      target = resolve(target, segment);
      try {
        if (lstatSync(target).isSymbolicLink())
          throw Error("Evidence symlink forbidden");
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
    }
    let before: string | null = null;
    try {
      const stat = lstatSync(target);
      if (!stat.isFile() || stat.size > 16384)
        throw Error("Evidence file unsupported");
      const fd = openSync(
        target,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      try {
        const opened = fstatSync(fd);
        if (
          !opened.isFile() ||
          opened.size > 16384 ||
          opened.ino !== stat.ino ||
          opened.dev !== stat.dev
        )
          throw Error("Evidence file changed or unsupported");
        const bytes = Buffer.alloc(16385);
        let length = 0,
          count = 0;
        while (
          length < bytes.length &&
          (count = readSync(fd, bytes, length, bytes.length - length, null)) > 0
        )
          length += count;
        if (length > 16384) throw Error("Evidence file too large");
        before = new TextDecoder("utf-8", { fatal: true }).decode(
          bytes.subarray(0, length),
        );
      } finally {
        closeSync(fd);
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    const digest = createHash("sha256")
      .update(JSON.stringify([rule.path, before]))
      .digest("hex");
    return {
      path: rule.path,
      before,
      kind: "local-observation",
      snapshot: { id: `local-observation:${digest}`, manifestHash: digest },
    };
  };
}
