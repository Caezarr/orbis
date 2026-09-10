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

export function getModel() {
  const config = providerStatus();
  if (!config.configured)
    throw new Error(
      "Connect an AI provider first: set ORBIS_AI_PROVIDER, ORBIS_AI_MODEL and its API key on the server.",
    );
  return config.provider === "anthropic"
    ? createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })(config.model)
    : createOpenAI({ apiKey: process.env.OPENAI_API_KEY })(config.model);
}
