import { describe, it, expect } from "vitest";
import { buildSeed } from "@/lib/store/seed";
import {
  dailyWork,
  dailyOperations,
  needsAttention,
  type OperationalTask,
} from "./work-overview";
describe("daily work", () => {
  it("does not guess completion dates or include future completions", () => {
    const data = buildSeed();
    data.runs = [undefined, "invalid", "2026-09-12T23:00:00Z"].map(
      (completedAt, i) => ({
        ...data.runs[0],
        id: String(i),
        engine: "agent-v1",
        state: "succeeded",
        completedAt,
      }),
    );
    expect(
      dailyWork(data, new Date("2026-09-12T12:00:00Z"), "UTC").done,
    ).toEqual([]);
  });
  it("uses the requested timezone for completion, not the host timezone", () => {
    const data = buildSeed();
    data.runs = [
      {
        ...data.runs[0],
        engine: "agent-v1",
        state: "succeeded",
        completedAt: "2026-09-11T22:30:00Z",
      },
    ];
    const now = new Date("2026-09-12T12:00:00Z");
    expect(dailyWork(data, now, "Europe/Paris").done).toHaveLength(1);
    expect(dailyWork(data, now, "America/Los_Angeles").done).toHaveLength(0);
  });
  it("excludes example runs and retains older unresolved decisions", () => {
    const data = buildSeed();
    const base = data.runs[0];
    data.runs = [
      {
        ...base,
        id: "old",
        engine: "agent-v1",
        state: "waiting_input",
        createdAt: "2026-09-01T10:00:00Z",
      },
      { ...base, id: "example", engine: undefined },
    ];
    const result = dailyWork(data, new Date("2026-09-10T12:00:00Z"));
    expect(result.runs.map((r) => r.id)).toEqual(["old"]);
    expect(result.attention).toHaveLength(1);
    expect(result.done).toHaveLength(0);
  });
  it("counts completion day rather than start day, and separates running work", () => {
    const data = buildSeed();
    const base = data.runs[0];
    data.runs = [
      {
        ...base,
        id: "done",
        engine: "agent-v1",
        state: "succeeded",
        createdAt: "2026-09-09T12:00:00Z",
        completedAt: "2026-09-10T12:00:00Z",
      },
      { ...base, id: "running", engine: "agent-v1", state: "running" },
    ];
    const result = dailyWork(data, new Date("2026-09-10T12:00:00Z"));
    expect(result.done.map((r) => r.id)).toEqual(["done"]);
    expect(result.remaining.map((r) => r.id)).toEqual(["running"]);
  });
  it("accepted results leave attention, rejected results stay", () => {
    const data = buildSeed();
    const run = {
      ...data.runs[0],
      state: "succeeded" as const,
      evaluationId: "review",
    };
    const report = {
      ...data.evaluations[0],
      id: "review",
      humanFeedback: { accepted: true },
    };
    expect(needsAttention(run, [report])).toBe(false);
    expect(
      needsAttention(run, [{ ...report, humanFeedback: { accepted: false } }]),
    ).toBe(true);
  });
});

describe("operational tasks", () => {
  it("separates actionable and upcoming states, ignores cancelled and undated completion", () => {
    const statuses: OperationalTask["status"][] = [
      "queued",
      "running",
      "needs_review",
      "completed",
      "failed",
      "cancelled",
    ];
    const tasks = statuses.map((status): OperationalTask => ({
      id: status,
      taskId: status,
      workflowId: "flow",
      title: status,
      status,
      createdAt: "2026-09-01T12:00:00Z",
      quote: { totalCents: 10 },
    }));
    tasks.push({
      ...tasks[3],
      id: "dated",
      completedAt: "2026-09-11T22:30:00Z",
    });
    const result = dailyOperations(
      [...tasks, tasks[0]],
      new Date("2026-09-12T12:00:00Z"),
      "Europe/Paris",
    );
    expect(result.attention.map((t) => t.id)).toEqual([
      "needs_review",
      "failed",
    ]);
    expect(result.remaining.map((t) => t.id)).toEqual(["queued", "running"]);
    expect(result.done.map((t) => t.id)).toEqual(["dated"]);
    expect(result.tasks).toHaveLength(7);
  });
});
