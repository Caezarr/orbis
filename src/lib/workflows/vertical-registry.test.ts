import { describe, expect, it } from "vitest";
import { businessWorkflows, resolveBusinessWorkflow } from "./blueprints";

describe("business vertical contracts", () => {
  it("provides ten distinct verticals and globally addressable tasks", () => {
    expect(businessWorkflows).toHaveLength(10);
    expect(new Set(businessWorkflows.map((w) => w.vertical)).size).toBe(10);
    const keys = businessWorkflows.flatMap(
      (w) => w.tasks?.map((t) => `${w.id}/${t.id}`) ?? [],
    );
    expect(keys).toHaveLength(30);
    expect(new Set(keys).size).toBe(keys.length);
  });

  for (const workflow of businessWorkflows) {
    it(`${workflow.id} has bounded, reviewable runtime contracts`, () => {
      expect(resolveBusinessWorkflow(workflow.id)).toBe(workflow);
      expect(workflow.tasks!.length).toBeGreaterThanOrEqual(3);
      expect(new Set(workflow.questions.map((q) => q.key)).size).toBe(
        workflow.questions.length,
      );
      for (const task of workflow.tasks!) {
        expect(task.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
        for (const field of [
          task.input,
          task.outcome,
          task.acceptance,
          task.limit,
          task.policy,
        ]) {
          expect(field?.length).toBeGreaterThan(15);
        }
        expect(task.unit).toBeTruthy();
        expect(task.tools?.length).toBeGreaterThan(0);
      }
    });
  }

  it("preserves connection aliases without silently defaulting unknown IDs", () => {
    expect(resolveBusinessWorkflow("rental")?.id).toBe("rental-operations");
    expect(resolveBusinessWorkflow("creator")?.id).toBe("creator-studio");
    expect(resolveBusinessWorkflow("customers")?.id).toBe("customer-support");
    expect(resolveBusinessWorkflow("unknown")).toBeUndefined();
    expect(resolveBusinessWorkflow("toString")).toBeUndefined();
  });

  it("retains original setup question keys and detailed operating stages", () => {
    expect(
      resolveBusinessWorkflow("rental")?.questions.map((q) => q.key),
    ).toEqual(["portfolio", "system", "operations", "knowledge", "authority"]);
    expect(
      resolveBusinessWorkflow("creator")?.questions.map((q) => q.key),
    ).toEqual(["profile", "voice", "sources", "channels", "budget"]);
    expect(resolveBusinessWorkflow("rental")?.stages).toHaveLength(6);
    expect(resolveBusinessWorkflow("creator")?.stages).toHaveLength(6);
  });
});
