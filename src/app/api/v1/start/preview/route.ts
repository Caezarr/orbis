import { z } from "zod";
import { isSameOriginMutation } from "@/lib/platform/auth";
import { quotePreview, startProfileSchema } from "@/lib/start/flow";
import { buildStartPreview, PREVIEW_MAX_BODY_BYTES } from "@/lib/start/preview";
import { clientKey } from "@/lib/start/public-site";

export const runtime = "nodejs";
export const maxDuration = 60;

/*
 * Public (no account): level-1 preview of the confirmed step-1 profile.
 * Same-origin only, bounded body, nothing stored. Model use is gated and
 * limited inside buildStartPreview; any limit falls back to the quote-only view.
 */
const headers = { "Cache-Control": "no-store" };
const fail = (error: string, status: number, code: string) => Response.json({ error, code }, { status, headers });

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return fail("Requête refusée.", 403, "same_origin_required");
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > PREVIEW_MAX_BODY_BYTES) return fail("Profil trop volumineux.", 413, "too_large");
  const raw = await request.text().catch(() => "");
  if (raw.length > PREVIEW_MAX_BODY_BYTES) return fail("Profil trop volumineux.", 413, "too_large");
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {}
  const parsed = z.object({ profile: startProfileSchema }).strict().safeParse(body);
  if (!parsed.success)
    return fail("Profil incomplet ou invalide. Revenez à l’étape « Votre entreprise ».", 400, "invalid_profile");
  try {
    return Response.json({ preview: await buildStartPreview(parsed.data.profile, clientKey(request)) }, { headers });
  } catch {
    return Response.json({ preview: quotePreview(parsed.data.profile, "error") }, { headers });
  }
}
