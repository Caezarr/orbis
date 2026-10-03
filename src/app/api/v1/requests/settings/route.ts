import { withWorkspaceRequest } from "@/lib/platform/request";
import {
  pipelineSettings,
  savePipelineSettings,
  settingsSchema,
} from "@/lib/followups/service";
import { requestsUnavailable } from "../gate";

export const runtime = "nodejs";
export async function GET(request: Request) {
  return withWorkspaceRequest(
    request,
    async () => requestsUnavailable() ?? Response.json(await pipelineSettings()),
  );
}
/** `{followupsEnabled, businessDays (1–30), maxStages (1–2), replyBaselineMinutes|null}` strict; owner/admin. */
export async function PUT(request: Request) {
  return withWorkspaceRequest(
    request,
    async () => {
      const off = requestsUnavailable();
      if (off) return off;
      const parsed = settingsSchema.safeParse(
        await request.json().catch(() => null),
      );
      if (!parsed.success)
        return Response.json({ error: "Réglages invalides." }, { status: 400 });
      return Response.json(await savePipelineSettings(parsed.data));
    },
    { requireRole: ["owner", "admin"] },
  );
}
