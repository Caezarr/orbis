import type { Run, StoreState } from "@/lib/domain/types";
import { dayKey } from "./contributions";
export type OperationalTask = {
  id: string;
  workflowId: string;
  taskId: string;
  title: string;
  status:
    | "queued"
    | "running"
    | "needs_review"
    | "completed"
    | "failed"
    | "cancelled";
  createdAt: string;
  completedAt?: string;
  output?: { title: string; body: string; citations: unknown[] };
  quote: { totalCents: number };
  error?: string;
};

export function dailyOperations(
  tasks: readonly OperationalTask[],
  now: Date,
  timeZone: string,
) {
  const unique = [...new Map(tasks.map((task) => [task.id, task])).values()];
  return {
    tasks: unique,
    attention: unique.filter((task) =>
      ["needs_review", "failed"].includes(task.status),
    ),
    remaining: unique.filter((task) =>
      ["queued", "running"].includes(task.status),
    ),
    done: unique.filter(
      (task) =>
        task.status === "completed" &&
        !!task.completedAt &&
        Date.parse(task.completedAt) <= now.getTime() &&
        dayKey(task.completedAt, timeZone) === dayKey(now, timeZone),
    ),
  };
}
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
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
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
        !!r.completedAt &&
        Date.parse(r.completedAt) <= now.getTime() &&
        dayKey(r.completedAt, timeZone) === dayKey(now, timeZone),
    ),
    remaining: runs.filter((r) => ["queued", "running"].includes(r.state)),
  };
}
