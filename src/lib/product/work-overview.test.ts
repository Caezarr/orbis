import { describe, it, expect } from "vitest";
import { buildSeed } from "@/lib/store/seed";
import { dailyWork, needsAttention } from "./work-overview";
describe("daily work", () => {
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
