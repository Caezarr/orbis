import { z } from "zod";
import { trackOnce } from "@/lib/analytics/events";
import { withWorkspaceRequest } from "@/lib/platform/request";
import { mutateStore } from "@/lib/store/store";
import { startProfileSchema } from "@/lib/start/flow";
import { applyStartProfile } from "@/lib/start/workspace";

export const runtime = "nodejs";
/** Saves the owner-confirmed profile from step 1 into the session workspace. */
export async function POST(request: Request) {
  return withWorkspaceRequest(
    request,
    async () => {
      const parsed = z
        .object({ profile: startProfileSchema })
        .strict()
        .safeParse(await request.json().catch(() => null));
      if (!parsed.success)
        return Response.json(
          { error: "Profil incomplet ou invalide. Revenez à l’étape « Votre entreprise ».", code: "invalid_profile" },
          { status: 400 },
        );
      const company = mutateStore((state) => applyStartProfile(state, parsed.data.profile));
      // Emitted at confirmation: the public reading itself has no workspace to attach to.
      await trackOnce("site_analyzed", { success: parsed.data.profile.origin !== "description" });
      return Response.json({ profile: { name: company.name, summary: company.summary, website: company.website } });
    },
    { requireRole: ["owner", "admin"] },
  );
}
