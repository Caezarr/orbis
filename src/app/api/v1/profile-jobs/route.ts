import { fail, ok } from "@/lib/api/http";
import { buildProfile } from "@/lib/runtime/profile";
import { mutateStore } from "@/lib/store/store";
import { nowIso } from "@/lib/time";
import { id } from "@/lib/ids";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { input?: string } | null;
  const input = body?.input?.trim();
  if (!input) return fail("Provide a website or an explanation.");
  const profile = buildProfile(input);
  mutateStore((state) => {
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
}
