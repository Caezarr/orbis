import { isSameOriginMutation } from "@/lib/platform/auth";
import { createSharedLimiter } from "@/lib/platform/limits";
import { clientKey, prepareStartProfile, siteInputSchema } from "@/lib/start/public-site";

export const runtime = "nodejs";
export const maxDuration = 60;

// Public (no account): step 1 of /start. Same-origin only, rate limited
// (shared across instances, migration 012; fails open to the in-memory limit),
// nothing stored.
const limiter = createSharedLimiter({ bucket: "start_site", limit: 6, windowMs: 10 * 60_000 });
let active = 0;
const headers = { "Cache-Control": "no-store" };
const fail = (error: string, status: number, code: string) =>
  Response.json({ error, code }, { status, headers });

export async function POST(request: Request) {
  if (!isSameOriginMutation(request))
    return fail("Requête refusée.", 403, "same_origin_required");
  const parsed = siteInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return fail(
      "Indiquez l’adresse de votre site, ou décrivez votre activité en une ou deux phrases (20 caractères minimum).",
      400,
      "invalid_input",
    );
  const slot = await limiter.take(clientKey(request));
  if (!slot.allowed)
    return fail(
      `Trop de lectures en peu de temps. Réessayez dans ${Math.max(1, Math.ceil(slot.retryAfterMs / 60_000))} min.`,
      429,
      "rate_limited",
    );
  if (active >= 3)
    return fail("Plusieurs lectures sont déjà en cours. Réessayez dans quelques secondes.", 429, "busy");
  active++;
  try {
    return Response.json({ profile: await prepareStartProfile(parsed.data) }, { headers });
  } catch {
    return fail(
      "Impossible de lire ce site public. Vérifiez son adresse (HTTPS) ou décrivez votre activité en deux phrases.",
      422,
      "site_unreadable",
    );
  } finally {
    active--;
  }
}
