import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildSeed } from "@/lib/store/seed";
import type { StoreState } from "@/lib/domain/types";
import { businessWorkflows } from "./blueprints";

const memory = vi.hoisted(() => ({ state: null as StoreState | null }));
vi.mock("@/lib/store/store", () => ({
  getStore: () => memory.state!,
  mutateStore: (mutate: (state: StoreState) => void) => mutate(memory.state!),
}));
import { POST } from "@/app/api/v1/workflows/[id]/prepare/route";

function request(id: string, answers: Record<string, string>) {
  return new Request(`http://localhost:3012/api/v1/workflows/${id}/prepare`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3012",
    },
    body: JSON.stringify({ answers }),
  });
}

describe("workflow preparation in explicit offline mode", () => {
  beforeEach(() => {
    vi.stubEnv("ORBIS_OFFLINE", "true");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("VERCEL", "");
    memory.state = buildSeed();
    memory.state.workflowBriefs = [];
  });
  afterEach(() => vi.unstubAllEnvs());

  for (const workflow of businessWorkflows) {
    it(`saves and updates ${workflow.id} without activating work`, async () => {
      const before = structuredClone(memory.state!);
      const answers = Object.fromEntries(
        workflow.questions.map((q) => [
          q.key,
          `Approved setup details for ${q.label}.`,
        ]),
      );
      const params = Promise.resolve({ id: workflow.id });
      const response = await POST(request(workflow.id, answers), { params });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        saved: true,
        workflowId: workflow.id,
        status: "brief_saved",
        active: false,
      });
      expect(memory.state!.workflowBriefs?.[0].answers).toEqual(answers);
      answers[workflow.questions[0].key] =
        "Updated owner-approved scope for this workflow.";
      expect(
        (await POST(request(workflow.id, answers), { params })).status,
      ).toBe(200);
      expect(memory.state!.workflowBriefs).toHaveLength(1);
      expect(memory.state!.workflowBriefs?.[0].answers).toEqual(answers);
      expect({ ...memory.state, workflowBriefs: [] }).toEqual(before);
    });
    it(`rejects incomplete ${workflow.id} preparation`, async () => {
      const response = await POST(request(workflow.id, {}), {
        params: Promise.resolve({ id: workflow.id }),
      });
      expect(response.status).toBe(400);
      expect(memory.state!.workflowBriefs).toEqual([]);
    });
  }
});
