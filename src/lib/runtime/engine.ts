import { id } from "@/lib/ids";
import { nowIso } from "@/lib/time";
import { getPackage } from "@/lib/capabilities/registry";
import { getStore, mutateStore, tenantOrThrow } from "@/lib/store/store";
import type {
  CorrectionScope,
  Mission,
  MissionVersion,
} from "@/lib/domain/types";
import { contextSnapshot } from "./agent-engine";

export function createMissionFromPackage(slug: string, tenantId: string) {
  const pkg = getPackage(slug);
  if (!pkg) throw new Error("Unknown package");
  return mutateStore((state) => {
    tenantOrThrow(state, tenantId);
    const missionId = id("mission");
    const version: MissionVersion = {
      id: id("mv"),
      tenantId,
      missionId,
      version: 1,
      immutable: false,
      outcome: pkg.outcome,
      knowledgeSourceIds: state.sources
        .filter(
          (s) =>
            s.tenantId === tenantId &&
            s.status === "ready" &&
            (s.required || s.kind === "profile"),
        )
        .map((s) => s.id),
      instructions:
        "Use approved sources. Name unknowns. Never invent prices. No external writes in test mode.",
      tools: pkg.tools,
      operatingMode: "test",
      budgetEur: pkg.costBoundEur,
      approvalPolicy: "always_external",
      createdAt: nowIso(),
    };
    const mission: Mission = {
      id: missionId,
      tenantId,
      packageSlug: pkg.slug,
      packageVersion: pkg.version,
      name: pkg.name,
      state: "configuring",
      draftVersionId: version.id,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    state.missions.unshift(mission);
    state.missionVersions.unshift(version);
    return { mission, version };
  });
}

export function applyFeedback(input: {
  evaluationId: string;
  correction: string;
  scope: CorrectionScope;
  accepted: boolean;
}) {
  if (typeof input.correction !== "string" || input.correction.length > 8000)
    throw new Error("Correction too long");
  if (!["this_result", "general_rule", "this_customer"].includes(input.scope))
    throw new Error("Invalid scope");
  if (input.scope === "this_customer")
    throw new Error(
      "Customer memory requires a verified identity. Choose this result or this mission.",
    );
  return mutateStore((state) => {
    const evaluation = state.evaluations.find(
      (e) =>
        e.id === input.evaluationId && e.tenantId === state.workspace.tenantId,
    );
    if (!evaluation) throw new Error("Evaluation not found");
    const run = state.runs.find((r) => r.id === evaluation.runId);
    if (
      input.accepted &&
      (!run ||
        run.engine !== "agent-v1" ||
        !evaluation.gatePassed ||
        contextSnapshot(state, run.missionId).hash !== run.policyHash)
    )
      throw new Error(
        "Review requires a passing live evaluation of the current configuration. Run this mission again.",
      );
    evaluation.humanFeedback = {
      accepted: input.accepted,
      correction: input.correction,
      scope: input.scope,
    };
    if (input.correction.trim() && run) {
      state.memory.unshift({
        id: id("mem"),
        tenantId: evaluation.tenantId,
        missionId: run.missionId,
        runId: run.id,
        kind: "procedural",
        title: "Review instruction",
        body: input.correction.trim(),
        scope: input.scope,
        source: `evaluation:${evaluation.id}`,
        owner: state.memberships[0]?.userId ?? "local-owner",
        confidence: 1,
        status: "proposed",
        createdAt: nowIso(),
      });
      const mission = state.missions.find((m) => m.id === run.missionId);
      if (mission) mission.state = "testing";
    }
    return { evaluation, runId: run?.id };
  });
}

export function activateMission(missionId: string) {
  return {
    ok: false as const,
    blockers: [
      "Continuous execution is not connected yet. Use the Lab to run and review individual missions.",
    ],
    mission: getStore().missions.find((m) => m.id === missionId),
  };
}

export function decideAction(input: {
  actionId: string;
  decision: "approved" | "rejected";
}) {
  if (input.decision !== "rejected")
    throw new Error(
      "External connector not configured. Nothing has been sent.",
    );
  return mutateStore((state) => {
    const action = state.actions.find(
      (a) => a.id === input.actionId && a.tenantId === state.workspace.tenantId,
    );
    const approval = state.approvals.find((a) => a.id === action?.approvalId);
    if (!action || !approval || approval.status !== "pending")
      throw new Error("Pending approval not found");
    approval.status = "rejected";
    approval.decidedAt = nowIso();
    action.state = "failed";
    return { action, approval };
  });
}
