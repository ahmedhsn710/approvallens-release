/** A bounded projection of server execution records, never agent-supplied narrative. */
export type ExecutionHistory = {
  version: "execution-history-v1";
  capturedAt: number;
  coverage: "recent-window";
  truncated: boolean;
  entries: {
    executionId: string;
    handler: "write_file" | "run_fixture_task";
    status: "executing" | "succeeded" | "failed" | "unknown_outcome";
    backend: string;
    evidence: "verified-receipt" | "unavailable";
    startSnapshotId: string;
    outputSnapshotId: string | null;
    appliesToProposalSnapshot: boolean;
    test: { passed: boolean; exitCode: number } | null;
  }[];
};
