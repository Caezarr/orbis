import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";

export function providerStatus() {
  const provider = process.env.ORBIS_AI_PROVIDER || "openai";
  const model = process.env.ORBIS_AI_MODEL || "";
  const supported = provider === "openai" || provider === "anthropic";
  const key =
    provider === "anthropic"
      ? process.env.ANTHROPIC_API_KEY
      : process.env.OPENAI_API_KEY;
  return {
    provider,
    model,
    configured: supported && !!model && !!key,
    maxCalls: 5,
    maxOutputTokensPerCall: 2400,
    externalWrites: false,
  };
}

/**
 * `classifier` uses ORBIS_AI_CLASSIFIER_MODEL (same provider and key) when set,
 * so cheap triage never silently routes data to another provider.
 */
export function getModel(purpose: "default" | "classifier" = "default") {
  const config = providerStatus();
  if (!config.configured)
    throw new Error(
      "Connect an AI provider first: set ORBIS_AI_PROVIDER, ORBIS_AI_MODEL and its API key on the server.",
    );
  const model =
    (purpose === "classifier" &&
      process.env.ORBIS_AI_CLASSIFIER_MODEL?.trim()) ||
    config.model;
  return config.provider === "anthropic"
    ? createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })(model)
    : createOpenAI({ apiKey: process.env.OPENAI_API_KEY })(model);
}

/**
 * Claude 5-family models (Sonnet 5.x, Opus 5.x, Fable 5.x) think by default,
 * and thinking tokens count toward `max_tokens`. Sized for the answer alone, a
 * call runs out of tokens while thinking and returns no JSON
 * (`AI_NoObjectGeneratedError`). These calls are short, bounded extractions:
 * keep effort low and add headroom for the thinking.
 */
export function thinksByDefault(model: string) {
  return /claude-(?:opus|sonnet|fable|mythos)-5/.test(model);
}
const THINKING_HEADROOM = { low: 2000, medium: 4000 } as const;

/** `maxOutputTokens` (+ provider options) for one call; `answerTokens` is the size of the answer itself. */
export function generationSettings(
  answerTokens: number,
  options: { purpose?: "default" | "classifier"; effort?: keyof typeof THINKING_HEADROOM } = {},
) {
  const config = providerStatus();
  const model =
    (options.purpose === "classifier" && process.env.ORBIS_AI_CLASSIFIER_MODEL?.trim()) || config.model;
  if (config.provider !== "anthropic" || !thinksByDefault(model)) return { maxOutputTokens: answerTokens };
  const effort = options.effort ?? "low";
  return {
    maxOutputTokens: answerTokens + THINKING_HEADROOM[effort],
    providerOptions: { anthropic: { effort } },
  };
}
