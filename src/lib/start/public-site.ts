import { z } from "zod";
import { analyzeCompany } from "@/lib/runtime/company-analysis";
import { readCompanySite } from "@/lib/runtime/company-site";
import { providerStatus } from "@/lib/runtime/provider";
import {
  DEFAULT_UNKNOWNS,
  profileFromDescription,
  profileFromSite,
  type StartProfile,
} from "./flow";

/**
 * Step 1 of /start, callable WITHOUT an account. Reads one public page through
 * the existing SSRF-guarded broker reader. A model call is made only when
 * ORBIS_START_AI_PROFILE=true and a provider is configured; otherwise the
 * profile is deterministic (verbatim quotes only). Nothing is persisted.
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
  readSite?: typeof readCompanySite;
  analyze?: typeof analyzeCompany;
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
  const site = await (deps.readSite ?? readCompanySite)(input.website);
  const base = profileFromSite(site);
  if (!ai) return base;
  try {
    // Quotes are verified verbatim against the page by validateCompanyAnalysis.
    const result = await (deps.analyze ?? analyzeCompany)({ website: site.website }, site);
    return {
      name: result.name,
      summary: result.summary,
      website: site.website,
      facts: result.facts.length
        ? result.facts.map((f) => ({ label: "Extrait du site", quote: f.quote, sourceUrl: site.website }))
        : base.facts,
      unknowns: unknownsFrom(result.questions, base.unknowns),
      origin: "ai",
    };
  } catch {
    // Model failure never blocks step 1: fall back to the deterministic reading.
    return base;
  }
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
