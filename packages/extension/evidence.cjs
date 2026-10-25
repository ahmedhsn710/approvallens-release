// Render only disclosed pipeline facts. This module grants no permission.
function evidenceLines(row) {
  const lines = [];
  if (row.analysis?.localHistory) {
    const history = row.analysis.localHistory;
    lines.push(
      `Prior local observations: ${history.entries.length}${history.truncated ? " (bounded window)" : ""}; same conversation, current service run only.`,
    );
    lines.push(
      "History is incomplete. Approval and hook-reported completion are not independently verified execution results.",
    );
  }
  for (const effect of row.analysis?.effects || []) {
    if (effect.content) {
      lines.push(
        `JSON: ${effect.content.status}; baseline: ${effect.content.source.kind}`,
      );
      for (const change of effect.content.changes) {
        const value = (v) => (v.present ? JSON.stringify(v.value) : "(absent)");
        lines.push(
          `${change.pointer}: ${value(change.before)} → ${value(change.after)}`,
        );
      }
      for (const limit of effect.content.limitations)
        lines.push(`Limitation: ${limit}`);
    } else if (["file_write", "file_delete"].includes(effect.kind)) {
      lines.push("Contents were not inspected; operation and path only.");
    }
    for (const rule of effect.constraintChecks || [])
      lines.push(`Preserve ${rule.field}: ${rule.status} (${rule.id})`);
  }
  if (row.versions?.prompt) lines.push(`Prompt: ${row.versions.prompt}`);
  if (row.reviewLatencyMs !== undefined)
    lines.push(`Review duration: ${row.reviewLatencyMs} ms`);
  if (row.usage)
    lines.push(
      `Tokens: input ${row.usage.prompt_tokens ?? "unknown"}, output ${row.usage.completion_tokens ?? "unknown"}`,
    );
  if (row.humanDecision) lines.push(`Human: ${row.humanDecision}`);
  return lines;
}
module.exports = { evidenceLines };
