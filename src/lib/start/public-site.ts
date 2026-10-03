import { generateText, Output } from "ai";
import { z } from "zod";
import { analyzeCompany } from "@/lib/runtime/company-analysis";
import { getModel, providerStatus } from "@/lib/runtime/provider";
import { DEFAULT_UNKNOWNS, profileFromDescription, type StartProfile } from "./flow";
import { crawlSite, type CrawlResult } from "./site-crawl";
import { profileFromCrawl, synthesisPrompt, synthesisSchema, validateSynthesis } from "./site-profile";

/**
 * Step 1 of /start, callable WITHOUT an account. Reads the home page and a few
 * high-value pages of the same site (bounded crawl through the SSRF-guarded
 * broker reader, robots.txt respected) and extracts sourced facts
 * deterministically. A model call is made only when ORBIS_START_AI_PROFILE=true
 * and a provider is configured, and it only rewrites the name and summary from
 * those facts. Nothing is persisted.
 */
export const siteInputSchema = z.union([
  z.object({ website: z.string().trim().min(4).max(2000) }).strict(),
  z
    .object({
      description: z.string().trim().min(20).max(1200),
      name: z.string().trim().max(120).optional(),
    })
    .strict(),
]);
export type SiteInput = z.infer<typeof siteInputSchema>;

export function publicAiEnabled() {
  return process.env.ORBIS_START_AI_PROFILE === "true" && providerStatus().configured;
}

export type PrepareDeps = {
  crawl?: (website: string) => Promise<CrawlResult>;
  analyze?: typeof analyzeCompany;
  synthesize?: (prompt: { system: string; prompt: string }, signal: AbortSignal) => Promise<unknown>;
  aiEnabled?: () => boolean;
};

export async function prepareStartProfile(
  input: SiteInput,
  deps: PrepareDeps = {},
): Promise<StartProfile> {
  const ai = (deps.aiEnabled ?? publicAiEnabled)();
  if ("description" in input) {
    const base = profileFromDescription(input.description, input.name);
    if (!ai) return base;
    try {
      const result = await (deps.analyze ?? analyzeCompany)({ description: input.description });
      return {
        ...base,
        name: input.name?.trim() || result.name,
        summary: result.summary,
        unknowns: unknownsFrom(result.questions, base.unknowns),
        origin: "ai",
      };
    } catch {
      return base;
    }
  }
  const crawl = await (deps.crawl ?? crawlSite)(input.website);
  const base = profileFromCrawl(crawl);
  if (!ai || base.facts.length < 2) return base;
  try {
    // The model only rewrites name + summary from the extracted facts (cited by id);
    // facts and unknowns stay the deterministic ground truth.
    const raw = await (deps.synthesize ?? providerSynthesis)(synthesisPrompt(base), AbortSignal.timeout(SYNTHESIS_TIMEOUT_MS));
    const parsed = synthesisSchema.safeParse(raw);
    if (!parsed.success) {
      logFallback("schema");
      return base;
    }
    const checked = validateSynthesis(parsed.data, base);
    return { ...base, name: checked.name, summary: checked.summary, summarySources: checked.sources, origin: "ai" };
  } catch (error) {
    // Model failure never blocks step 1: fall back to the deterministic reading.
    logFallback(fallbackReason(error));
    return base;
  }
}

const VALIDATION_REASONS = new Set(["summary cites no known fact", "summary rejected", "unsupported figure"]);

/** Why the AI summary was not used: a reason code only, never site or model content. */
function fallbackReason(error: unknown) {
  const e = error as { name?: string; statusCode?: number; status?: number; message?: string };
  const status = e?.statusCode ?? e?.status;
  if (status) return `provider_${status}`;
  if (e?.name === "TimeoutError" || e?.name === "AbortError") return "timeout";
  // validateSynthesis throws fixed messages only (no content).
  if (e?.message && VALIDATION_REASONS.has(e.message)) return `validation: ${e.message}`;
  return (e?.name || "error").replace(/[^A-Za-z0-9_]/g, "").slice(0, 40) || "error";
}
function logFallback(reason: string) {
  console.warn(JSON.stringify({ event: "start_profile_ai_fallback", reason }));
}

const SYNTHESIS_TIMEOUT_MS = 15_000;
/** Provider-backed synthesis. No tools, no retries. */
export async function providerSynthesis(prompt: { system: string; prompt: string }, signal: AbortSignal) {
  const result = await generateText({
    model: getModel(),
    system: prompt.system,
    prompt: prompt.prompt,
    output: Output.object({ schema: synthesisSchema }),
    maxOutputTokens: 700,
    maxRetries: 0,
    abortSignal: signal,
  });
  return result.output;
}
function unknownsFrom(questions: string[], fallback: string[]) {
  const merged = [...questions.map((q) => q.trim()).filter((q) => q.length >= 2), ...DEFAULT_UNKNOWNS];
  const unique = [...new Set(merged)].slice(0, 6);
  return unique.length ? unique : fallback;
}

// ------------------------------------------------------------ abuse limits

/**
 * Best-effort, per-instance limits for an unauthenticated endpoint: a sliding
 * window per client key and a global concurrency cap. Serverless instances do
 * not share this memory; a durable limiter (edge/WAF or Postgres) is still
 * required before public launch.
 */
export function createRateLimiter(options: { limit: number; windowMs: number; maxKeys?: number }) {
  const hits = new Map<string, number[]>();
  return {
    take(key: string, now = Date.now()) {
      const since = now - options.windowMs;
      const recent = (hits.get(key) ?? []).filter((t) => t > since);
      if (recent.length >= options.limit) {
        hits.set(key, recent);
        return { allowed: false, retryAfterMs: recent[0] + options.windowMs - now };
      }
      recent.push(now);
      hits.delete(key);
      hits.set(key, recent);
      // Bound memory: drop the least recently used keys.
      while (hits.size > (options.maxKeys ?? 5000)) {
        const oldest = hits.keys().next().value;
        if (oldest === undefined) break;
        hits.delete(oldest);
      }
      return { allowed: true, retryAfterMs: 0 };
    },
  };
}

/** Client key from the platform-set forwarded header; never trusted for identity. */
export function clientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const real = request.headers.get("x-real-ip")?.trim();
  return (forwarded || real || "unknown").slice(0, 64);
}
