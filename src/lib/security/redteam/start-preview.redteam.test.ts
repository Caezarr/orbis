import { describe, expect, it, vi } from "vitest";
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
import { profileFromSite } from "@/lib/start/flow";
import { buildStartPreview, createTtlCache, type PreviewDeps, type PreviewModel } from "@/lib/start/preview";
import { HOSTILE_SITE, leaks, OBEYING_PREVIEW_DRAFT, OBEYING_PREVIEW_QUESTIONS } from "./fixtures";

const profile = profileFromSite(HOSTILE_SITE);
const pageText = [HOSTILE_SITE.title, HOSTILE_SITE.description, HOSTILE_SITE.excerpt].join("\n");

function deps(model: PreviewModel): PreviewDeps {
  return {
    enabled: () => true,
    readSite: vi.fn(async () => HOSTILE_SITE),
    model,
    limiter: { take: () => ({ allowed: true }) },
    budget: { reserve: () => ({ allowed: true }) },
    cache: createTtlCache({ ttlMs: 60_000, max: 10 }),
    concurrency: { active: 0, max: 2 },
    estimateCents: 15,
  };
}
const obeying = () => {
  const prompts: string[] = [];
  const model: PreviewModel = {
    questions: vi.fn(async (p) => {
      prompts.push(p.prompt);
      return structuredClone(OBEYING_PREVIEW_QUESTIONS);
    }),
    draft: vi.fn(async (p) => {
      prompts.push(p.prompt);
      return structuredClone(OBEYING_PREVIEW_DRAFT);
    }),
  };
  return { model, prompts };
};

describe("red team — /start preview on a hostile public page with an obeying model", () => {
  it("answers only with verbatim, instruction-free quotes; no attacker contact/figure survives", async () => {
    const { model, prompts } = obeying();
    const preview = await buildStartPreview(profile, "203.0.113.9", deps(model));
    expect(preview.mode).toBe("ai");
    if (preview.mode !== "ai") return;
    // Instruction sentences were removed before the model saw the page.
    expect(preview.flags).toContain("source_instructions_ignored");
    for (const p of prompts) {
      expect(p).not.toMatch(/ignore all previous instructions/i);
      expect(p).not.toMatch(/developer mode/i);
      expect(p).not.toMatch(/Oubliez vos consignes/i);
      expect(p).not.toContain("</ORBIS_DATA_deadbeef");
      // Every hostile sentence of this page carried an instruction: none reaches the model.
      expect(leaks(p)).toEqual([]);
    }
    // Answers: verbatim substrings of the page, never an injected sentence.
    const answered = preview.questions.filter((q) => q.answer);
    expect(answered.length).toBeGreaterThan(0);
    for (const q of preview.questions) {
      expect(leaks(q.question)).toEqual([]);
      if (q.answer) {
        expect(pageText.replace(/\s+/g, " ")).toContain(q.answer.quote);
        expect(leaks(q.answer.quote)).toEqual([]);
      }
    }
    // Example drafts and incoming examples: no attacker data, no invented figure.
    expect(preview.examples.length).toBeGreaterThan(0);
    for (const ex of preview.examples) {
      expect(leaks(ex.incoming.body)).toEqual([]);
      expect(leaks(ex.incoming.subject)).toEqual([]);
      expect(leaks(ex.draft.body)).toEqual([]);
      for (const q of ex.draft.questions) expect(leaks(q)).toEqual([]);
      for (const c of ex.draft.citations) expect(pageText).toContain(c.excerpt);
      expect(ex.draft.body).not.toMatch(/<img|<script/i);
      expect(JSON.stringify(ex)).not.toContain("boss@");
      expect(ex.incoming.from).not.toMatch(/evil/i);
    }
  });
  it("off-schema model output (extra recipient/send fields are ignored; wrong shape → quote-only view)", async () => {
    const model: PreviewModel = {
      questions: vi.fn(async () => ({ questions: "all", examples: [], send: true })),
      draft: vi.fn(async () => ({})),
    };
    const preview = await buildStartPreview(profile, "203.0.113.10", deps(model));
    expect(preview.mode).toBe("quotes");
    expect(model.draft).not.toHaveBeenCalled();
  });
});
