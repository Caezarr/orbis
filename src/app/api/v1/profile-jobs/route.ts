import { withWorkspaceRequest } from "@/lib/platform/request";
import { fail, ok } from "@/lib/api/http";
import { buildProfile } from "@/lib/runtime/profile";
import { getStore, mutateStore } from "@/lib/store/store";
import { nowIso } from "@/lib/time";
import { id } from "@/lib/ids";

export async function POST(request: Request) {
  return withWorkspaceRequest(request, async () => {
  const body = (await request.json().catch(() => null)) as { input?: string } | null;
  const input = typeof body?.input === "string" ? body.input.trim() : "";
  if (!input || input.length > 8000) return fail("Provide a website or an explanation, up to 8,000 characters.");
  const profile = buildProfile(input, getStore().workspace.tenantId);
  mutateStore((state) => {
    profile.tenantId = state.workspace.tenantId;
    state.profile = profile;
    const existing = state.sources.find((s) => s.kind === "profile");
    if (existing) {
      existing.name = `${profile.name} profile`;
      existing.excerpt = profile.summary;
      existing.origin = profile.website ?? "workspace";
    } else {
      state.sources.unshift({
        id: id("src"),
        tenantId: state.workspace.tenantId,
        name: `${profile.name} profile`,
        kind: "profile",
        status: "ready",
        origin: profile.website ?? "workspace",
        excerpt: profile.summary,
        version: "sv_profile",
        required: true,
        createdAt: nowIso(),
      });
    }
    state.workspace.name = profile.name;
    state.outbox.unshift({
      id: id("evt"),
      tenantId: state.workspace.tenantId,
      type: "profile.completed",
      payload: { profileId: profile.id },
      createdAt: nowIso(),
    });
  });
  return ok({ jobId: id("job"), profile });
  });
}
