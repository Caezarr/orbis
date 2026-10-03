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
        .object({
          profile: startProfileSchema,
          // Set by the browser when the anonymous instant preview was displayed.
          preview: z.object({ ai: z.boolean() }).strict().optional(),
        })
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
      // Same approach: the anonymous preview is counted once it can be linked to a workspace.
      if (parsed.data.preview) await trackOnce("preview_shown", { ai: parsed.data.preview.ai });
      return Response.json({ profile: { name: company.name, summary: company.summary, website: company.website } });
    },
    { requireRole: ["owner", "admin"] },
  );
}
