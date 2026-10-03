import { afterEach, describe, expect, it, vi } from "vitest";
import { generationSettings, thinksByDefault } from "./provider";

afterEach(() => vi.unstubAllEnvs());

function provider(name: string, model: string, classifier = "") {
  vi.stubEnv("ORBIS_AI_PROVIDER", name);
  vi.stubEnv("ORBIS_AI_MODEL", model);
  vi.stubEnv("ORBIS_AI_CLASSIFIER_MODEL", classifier);
  vi.stubEnv("ANTHROPIC_API_KEY", "test");
  vi.stubEnv("OPENAI_API_KEY", "test");
}

describe("generationSettings", () => {
  it("detects the Claude models that think by default", () => {
    for (const m of ["claude-sonnet-5-5", "claude-sonnet-5", "claude-opus-5-5", "claude-fable-5-1"]) expect(thinksByDefault(m)).toBe(true);
    for (const m of ["claude-haiku-4-5-20251001", "claude-sonnet-4-6", "gpt-5"]) expect(thinksByDefault(m)).toBe(false);
  });
  it("adds thinking headroom and low effort on thinking models", () => {
    provider("anthropic", "claude-sonnet-5-5");
    expect(generationSettings(700)).toEqual({ maxOutputTokens: 2700, providerOptions: { anthropic: { effort: "low" } } });
    expect(generationSettings(1800, { effort: "medium" })).toEqual({ maxOutputTokens: 5800, providerOptions: { anthropic: { effort: "medium" } } });
  });
  it("leaves non-thinking classifiers and other providers unchanged", () => {
    provider("anthropic", "claude-sonnet-5-5", "claude-haiku-4-5-20251001");
    expect(generationSettings(200, { purpose: "classifier" })).toEqual({ maxOutputTokens: 200 });
    provider("openai", "gpt-5");
    expect(generationSettings(700)).toEqual({ maxOutputTokens: 700 });
  });
});
