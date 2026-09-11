import { z } from "zod";
import { isLocalMutation } from "@/lib/api/local-request";
import { fail, ok } from "@/lib/api/http";
import { previewHostawayReservations } from "@/lib/integrations/hostaway";
export async function POST(request: Request) {
  if (!isLocalMutation(request))
    return fail(
      "Authenticated workspace access is required. This installation is local-only.",
      403,
    );
  const parsed = z
    .object({ listingId: z.number().int().positive() })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Choose a valid Hostaway property ID.");
  const accountId = process.env.HOSTAWAY_ACCOUNT_ID,
    clientSecret = process.env.HOSTAWAY_CLIENT_SECRET;
  if (!accountId || !clientSecret)
    return fail(
      "An administrator must configure the Hostaway account before previewing reservations.",
      503,
    );
  const allowed = (process.env.HOSTAWAY_ALLOWED_LISTING_IDS ?? "")
    .split(",")
    .map((s) => Number(s.trim()));
  if (!allowed.includes(parsed.data.listingId))
    return fail("This property is not in the approved portfolio.", 403);
  try {
    return ok(
      await previewHostawayReservations({
        accountId,
        clientSecret,
        listingId: parsed.data.listingId,
      }),
    );
  } catch {
    return fail(
      "The preview could not be verified. Check Hostaway access and the approved property ID. Nothing was changed.",
      502,
    );
  }
}
