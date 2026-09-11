import { fail, ok } from "@/lib/api/http";
import {
  getStore,
  mutateStore,
  resetStore,
  reconcileStaleRuns,
} from "@/lib/store/store";
import { buildProfile } from "@/lib/runtime/profile";
import { nowIso } from "@/lib/time";
import { id } from "@/lib/ids";

export async function GET() {
  reconcileStaleRuns();
  const state = getStore();
  return ok({
    workspace: state.workspace,
    memberships: state.memberships,
    teamGroups: state.teamGroups ?? [],
    workflowBriefs: state.workflowBriefs ?? [],
    profile: state.profile,
    packages: state.packages,
    missions: state.missions,
    missionVersions: state.missionVersions,
    sources: state.sources,
    instructions: state.instructions,
    memory: state.memory,
    connections: state.connections,
    runs: state.runs,
    artifacts: state.artifacts,
    evaluations: state.evaluations,
    approvals: state.approvals,
    actions: state.actions,
    usage: state.usage,
    audit: state.audit,
    cases: state.cases,
    decisions: state.decisions,
    signals: state.signals,
    copilot: state.copilot,
    impact: state.impact,
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { reset?: boolean };
  if (body.reset) {
    resetStore();
    return ok({ reset: true });
  }
  return fail("Unsupported");
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    profile?: ReturnType<typeof buildProfile>;
    claims?: { id: string; value: string; kind?: string }[];
  };
  if (body.profile) {
    mutateStore((state) => {
      state.profile = body.profile!;
      const existing = state.sources.find((s) => s.kind === "profile");
      if (existing) {
        existing.excerpt = body.profile!.summary;
        existing.name = `${body.profile!.name} profile`;
      } else {
        state.sources.unshift({
          id: id("src"),
          tenantId: state.workspace.tenantId,
          name: `${body.profile!.name} profile`,
          kind: "profile",
          status: "ready",
          origin: body.profile!.website ?? "workspace",
          excerpt: body.profile!.summary,
          version: "sv_profile",
          required: true,
          createdAt: nowIso(),
        });
      }
    });
  }
  if (body.claims && getStore().profile) {
    mutateStore((state) => {
      if (!state.profile) return;
      for (const claim of body.claims ?? []) {
        const found = state.profile.claims.find((item) => item.id === claim.id);
        if (found) found.value = claim.value;
      }
    });
  }
  return ok({ profile: getStore().profile });
}
