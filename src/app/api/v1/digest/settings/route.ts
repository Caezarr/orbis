import { withWorkspaceRequest } from "@/lib/platform/request";
import { isOfflineMode } from "@/lib/platform/context";
import { authenticatedUser } from "@/lib/platform/auth";
import { digestEnabled, digestSettings, digestSettingsSchema, setDigest } from "@/lib/digest/service";

export const runtime = "nodejs";
const unavailable = () =>
  Response.json({ error: "The daily digest is not enabled for this deployment." }, { status: 503 });

export async function GET(request: Request) {
  return withWorkspaceRequest(request, async () => {
    if (!digestEnabled() || isOfflineMode()) return unavailable();
    return Response.json(await digestSettings());
  });
}
/**
 * Opt-in for the session user only. Body `{enabled: boolean}` strict. The
 * recipient is the authenticated account's confirmed e-mail, read here from
 * the provider-validated session, never from the request.
 */
export async function PUT(request: Request) {
  return withWorkspaceRequest(request, async () => {
    if (!digestEnabled() || isOfflineMode()) return unavailable();
    const parsed = digestSettingsSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Invalid settings." }, { status: 400 });
    const user = await authenticatedUser();
    return Response.json(
      await setDigest(parsed.data.enabled, { email: user.email, emailConfirmedAt: user.email_confirmed_at }),
    );
  });
}
