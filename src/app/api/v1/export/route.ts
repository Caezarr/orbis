import { ok } from "@/lib/api/http";
import { getStore } from "@/lib/store/store";

export async function GET() {
  const state = getStore();
  const payload = {
    exportedAt: new Date().toISOString(),
    workspace: state.workspace,
    profile: state.profile,
    missions: state.missions,
    missionVersions: state.missionVersions,
    sources: state.sources.map(({ ...source }) => source),
    instructions: state.instructions,
    memory: state.memory,
    artifacts: state.artifacts,
    evaluations: state.evaluations,
    usage: state.usage,
    audit: state.audit,
    notice: "Secrets and provider tokens are never exported. Secret references only.",
  };
  return ok(payload);
}
