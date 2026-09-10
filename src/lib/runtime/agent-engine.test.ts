import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoreState } from "@/lib/domain/types";
const mocks = vi.hoisted(() => ({
  state: null as unknown as StoreState,
  generate: vi.fn(),
}));
vi.mock("ai", () => ({
  generateText: mocks.generate,
  Output: { object: (value: unknown) => value },
}));
vi.mock("./provider", () => ({
  providerStatus: () => ({
    configured: true,
    provider: "test",
    model: "test-model",
  }),
  getModel: () => "mock-model",
}));
vi.mock("@/lib/store/store", () => ({
  getStore: () => mocks.state,
  mutateStore: (fn: (s: StoreState) => unknown) => fn(mocks.state),
  tenantOrThrow: (s: StoreState) => s,
}));
import { buildSeed } from "@/lib/store/seed";
import { contextSnapshot, runTest } from "./agent-engine";
import { evidenceChecks, scopedMemory, draftSchema } from "./contracts";
import { applyFeedback, activateMission, decideAction } from "./engine";
import { PATCH as updateMission } from "@/app/api/v1/missions/route";

const plan = {
  objective: "Prepare a customer response",
  requirements: ["Respect evidence"],
  missing: [],
  blocked: false,
};
const review = {
  coverage: true,
  grounded: true,
  safe: true,
  issues: [],
  summary: "Covered",
};
function output(value: unknown) {
  return { output: value, usage: { inputTokens: 100, outputTokens: 50 } };
}
function draft() {
  const source = contextSnapshot(mocks.state, "mission_request").sources[0];
  return {
    title: "Prepared response",
    body: "A grounded, reviewable draft.",
    unknowns: [],
    citations: [
      {
        sourceId: source.id,
        excerpt: source.excerpt.slice(0, 25),
        claim: "Company context",
      },
    ],
  };
}
function happy() {
  mocks.generate
    .mockResolvedValueOnce(output(plan))
    .mockResolvedValueOnce(output(draft()))
    .mockResolvedValueOnce(output(review));
}
beforeEach(() => {
  mocks.state = buildSeed();
  mocks.generate.mockReset();
});

describe("bounded enterprise workflow", () => {
  it.each([
    "request-analysis",
    "meeting-prep",
    "research-brief",
    "content-draft",
  ])("runs the %s contract through the shared engine", async (slug) => {
    mocks.state.missions.find((m) => m.id === "mission_request")!.packageSlug =
      slug;
    happy();
    const result = await runTest({
      missionId: "mission_request",
      text: "Prepare an evidence-based deliverable for this request.",
    });
    expect(result.evaluation?.gatePassed).toBe(true);
    expect(result.run.workflowId).toBe(`${slug}:agent-v1`);
  });

  it("refuses a second concurrent run in the same workspace", async () => {
    let release!: (value: unknown) => void;
    mocks.generate
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      )
      .mockResolvedValueOnce(output(draft()))
      .mockResolvedValueOnce(output(review));
    const first = runTest({
      missionId: "mission_request",
      text: "Prepare a customer response.",
    });
    await expect(
      runTest({
        missionId: "mission_request",
        text: "Prepare another customer response.",
      }),
    ).rejects.toThrow("in progress");
    release(output(plan));
    await first;
    expect(mocks.generate).toHaveBeenCalledTimes(3);
  });
  it("persists real stages and usage, never creates an external action", async () => {
    happy();
    const actions = mocks.state.actions.length;
    const result = await runTest({
      missionId: "mission_request",
      text: "Prepare a grounded response for this customer.",
      idempotencyKey: "first",
    });
    expect(result.run.state).toBe("succeeded");
    expect(result.run.mode).toBe("test");
    expect(result.run.steps).toHaveLength(3);
    expect(result.run.usage?.inputTokens).toBe(300);
    expect(result.run.usage?.costKnown).toBe(false);
    expect(mocks.state.actions).toHaveLength(actions);
    expect(mocks.generate.mock.calls[0][0]).toMatchObject({
      maxRetries: 0,
      maxOutputTokens: 2400,
    });
  });
  it("deduplicates retries without another provider call", async () => {
    happy();
    const input = {
      missionId: "mission_request",
      text: "Prepare a grounded response.",
      idempotencyKey: "same",
    };
    const first = await runTest(input);
    const retry = await runTest(input);
    expect(retry.run.id).toBe(first.run.id);
    expect(mocks.generate).toHaveBeenCalledTimes(3);
    await expect(
      runTest({ ...input, text: "This is a different request." }),
    ).rejects.toThrow("different request");
  });
  it("asks for input instead of pretending to have finished", async () => {
    mocks.generate.mockResolvedValueOnce(
      output({ ...plan, blocked: true, missing: ["Which customer?"] }),
    );
    const result = await runTest({
      missionId: "mission_request",
      text: "Prepare a customer response.",
    });
    expect(result.run.state).toBe("waiting_input");
    expect(result.evaluation?.gatePassed).toBe(false);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });
  it("repairs once and stops after five calls even if checks still fail", async () => {
    const bad = {
      ...review,
      grounded: false,
      issues: ["Unsupported commitment"],
    };
    mocks.generate
      .mockResolvedValueOnce(output(plan))
      .mockResolvedValueOnce(output(draft()))
      .mockResolvedValueOnce(output(bad))
      .mockResolvedValueOnce(output(draft()))
      .mockResolvedValueOnce(output(bad));
    const result = await runTest({
      missionId: "mission_request",
      text: "Prepare a customer response.",
    });
    expect(mocks.generate).toHaveBeenCalledTimes(5);
    expect(result.evaluation?.gatePassed).toBe(false);
  });
  it("records provider failure without leaking its error or claiming success", async () => {
    mocks.generate.mockRejectedValueOnce(new Error("secret-provider-payload"));
    await expect(
      runTest({
        missionId: "mission_request",
        text: "Prepare a customer response.",
      }),
    ).rejects.not.toThrow("secret-provider-payload");
    const run = mocks.state.runs[0];
    expect(run.state).toBe("failed");
    expect(run.steps[0].status).toBe("failed");
    expect(run.artifactIds).toHaveLength(0);
  });
  it("invalidates an evaluation when context changes during a call", async () => {
    mocks.generate
      .mockImplementationOnce(async () => {
        mocks.state.missionVersions.find(
          (v) =>
            v.id ===
            mocks.state.missions.find((m) => m.id === "mission_request")!
              .draftVersionId,
        )!.instructions += " Changed";
        return output(plan);
      })
      .mockResolvedValueOnce(output(draft()))
      .mockResolvedValueOnce(output(review));
    const result = await runTest({
      missionId: "mission_request",
      text: "Prepare a customer response.",
    });
    expect(
      result.evaluation?.checks.find((c) => c.id === "context")?.status,
    ).toBe("fail");
  });
});

describe("evidence and memory boundaries", () => {
  it("forks an immutable version rather than overwriting it", async () => {
    const mission = mocks.state.missions.find(
      (m) => m.id === "mission_request",
    )!;
    const original = mocks.state.missionVersions.find(
      (v) => v.id === mission.draftVersionId,
    )!;
    original.immutable = true;
    const instructions = original.instructions;
    const response = await updateMission(
      new Request("http://localhost/api/v1/missions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          missionId: mission.id,
          instructions: "New operating rule",
          operatingMode: "test",
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(mission.draftVersionId).not.toBe(original.id);
    expect(original.instructions).toBe(instructions);
    expect(mission.state).toBe("configuring");
  });

  it("refuses review acceptance after the source context changes", async () => {
    happy();
    const result = await runTest({
      missionId: "mission_request",
      text: "Prepare a grounded customer response.",
    });
    contextSnapshot(mocks.state, "mission_request").sources[0].excerpt +=
      " changed";
    expect(() =>
      applyFeedback({
        evaluationId: result.evaluation!.id,
        correction: "",
        scope: "this_result",
        accepted: true,
      }),
    ).toThrow("current configuration");
  });
  it("rejects fake quotes, unknown sources and missing citations", () => {
    const sources = contextSnapshot(mocks.state, "mission_request").sources;
    const value = draft();
    expect(evidenceChecks(value, sources, review)[0].status).toBe("pass");
    value.citations[0].excerpt = "Invented quote that does not exist";
    expect(evidenceChecks(value, sources, review)[0].status).toBe("fail");
    expect(
      evidenceChecks({ ...value, citations: [] }, sources, review)[0].status,
    ).toBe("fail");
    expect(draftSchema.safeParse({ title: "Only a title" }).success).toBe(
      false,
    );
  });
  it("includes only approved workspace or matching mission memory", () => {
    const base = mocks.state.memory[0];
    const rules = [
      {
        ...base,
        id: "yes",
        tenantId: "tenant-a",
        scope: "general_rule" as const,
        missionId: "m",
        status: "approved" as const,
      },
      {
        ...base,
        id: "other",
        tenantId: "tenant-b",
        scope: "workspace" as const,
        status: "approved" as const,
      },
      {
        ...base,
        id: "result",
        tenantId: "tenant-a",
        scope: "this_result" as const,
        missionId: "m",
        status: "approved" as const,
      },
      {
        ...base,
        id: "proposal",
        tenantId: "tenant-a",
        scope: "general_rule" as const,
        missionId: "m",
        status: "proposed" as const,
      },
    ];
    expect(scopedMemory(rules, "tenant-a", "m").map((m) => m.id)).toEqual([
      "yes",
    ]);
  });
  it("fingerprints source contents, not only source identifiers", () => {
    const first = contextSnapshot(mocks.state, "mission_request");
    first.sources[0].excerpt += " Revised evidence";
    expect(contextSnapshot(mocks.state, "mission_request").hash).not.toBe(
      first.hash,
    );
  });
  it("preserves the original artifact when a correction is proposed", async () => {
    happy();
    const result = await runTest({
      missionId: "mission_request",
      text: "Prepare a customer response.",
    });
    const original = result.artifact!.body;
    applyFeedback({
      evaluationId: result.evaluation!.id,
      correction: "Always use a concise summary.",
      scope: "general_rule",
      accepted: false,
    });
    expect(result.artifact!.body).toBe(original);
    expect(mocks.state.memory[0].status).toBe("proposed");
    expect(mocks.state.memory[0].missionId).toBe("mission_request");
  });
  it("cannot activate a scheduler or approve a nonexistent external connector", () => {
    expect(activateMission("mission_request").ok).toBe(false);
    expect(() =>
      decideAction({ actionId: "any", decision: "approved" }),
    ).toThrow("Nothing has been sent");
  });
});
