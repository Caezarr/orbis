import { createHash } from "node:crypto";
import { z } from "zod";
import type { TaskPriceSnapshot } from "@/lib/billing/task-quote";
import type { Source, CheckResult } from "@/lib/domain/types";

export const enqueueSchema = z
  .object({
    missionId: z.string().min(1).max(200),
    workflowId: z.string().min(1).max(200),
    text: z.string().trim().min(10).max(20000),
    expectedTotalCents: z.number().int().nonnegative(),
    expectedRateVersion: z.string().min(1).max(200),
    baselineMinutes: z.number().int().min(1).max(10080).optional(),
    expectedBillingMode: z.enum(["preview", "pay_per_task"]).default("preview"),
  })
  .strict();
export type EnqueueInput = z.infer<typeof enqueueSchema>;
export type TaskInput = {
  billingMode?: "preview" | "pay_per_task";
  missionId: string;
  packageSlug: string;
  contextHash: string;
  text: string;
  objective: string;
  instructions: string;
  rules: string[];
  memory: string[];
  sources: Source[];
};
export type TaskOutput = {
  title: string;
  body: string;
  unknowns: string[];
  citations: {
    sourceId: string;
    sourceName: string;
    excerpt: string;
    locator: string;
  }[];
  checks: CheckResult[];
  usage: { inputTokens: number; outputTokens: number };
};
export type TaskRow = {
  id: string;
  workspace_id: string;
  tenant_id: string;
  created_by: string;
  request_hash: string;
  workflow_id: string;
  task_id: string;
  title: string;
  status:
    | "queued"
    | "running"
    | "needs_review"
    | "completed"
    | "failed"
    | "cancelled";
  input: TaskInput;
  quote: TaskPriceSnapshot;
  total_cents: number;
  output: TaskOutput | null;
  error: string | null;
  attempts: number;
  lease_token: string | null;
  lease_until: Date | null;
  created_at: Date;
  ready_at: Date | null;
  completed_at: Date | null;
  started_at?: Date | null;
  execution_ms?: number;
  baseline_minutes?: number | null;
};
export const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function publicTask(row: TaskRow) {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    taskId: row.task_id,
    title: row.title,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    completedAt: row.completed_at?.toISOString(),
    readyAt: row.ready_at?.toISOString(),
    executionMs: Number(row.execution_ms ?? 0),
    baselineMinutes: row.baseline_minutes ?? null,
    output: row.output ?? undefined,
    quote: row.quote,
    error: row.error ?? undefined,
    reviewToken: digest({ id: row.id, output: row.output, quote: row.quote }),
    scope: "Read-only document preparation. No external action is performed.",
    billable: row.status === "completed",
    billingMode: row.input.billingMode ?? "preview",
  };
}
