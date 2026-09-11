import type { Run, StoreState } from "@/lib/domain/types";
export function needsAttention(
  run: Run,
  evaluations: StoreState["evaluations"],
) {
  return (
    [
      "waiting_input",
      "waiting_approval",
      "failed",
      "needs_reconciliation",
    ].includes(run.state) ||
    (run.state === "succeeded" &&
      !evaluations.find((e) => e.id === run.evaluationId)?.humanFeedback
        ?.accepted)
  );
}
export function dailyWork(
  data: Pick<StoreState, "runs" | "evaluations">,
  now = new Date(),
) {
  const runs = data.runs
    .filter((r) => r.engine === "agent-v1")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    runs,
    attention: runs.filter((r) => needsAttention(r, data.evaluations)),
    done: runs.filter(
      (r) =>
        r.state === "succeeded" &&
        new Date(r.completedAt ?? r.createdAt).toDateString() ===
          now.toDateString(),
    ),
    remaining: runs.filter((r) => ["queued", "running"].includes(r.state)),
  };
}
