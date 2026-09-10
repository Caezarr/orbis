import { findFlow } from "./catalog";
import type { StoreState, Mission, MissionVersion } from "@/lib/domain/types";
import { id } from "@/lib/ids";
export function installFlow(
  state: StoreState,
  auditId: string,
  flowId: string,
  sourcing: Record<string, "own" | "managed" | "later">,
) {
  const audit = state.businessAudits?.find(
    (a) => a.id === auditId && a.tenantId === state.workspace.tenantId,
  );
  const flow = findFlow(flowId);
  if (!audit || !flow) throw new Error("Plan ou cas introuvable.");
  if (
    Object.keys(sourcing).some((c) => !flow.capabilities.includes(c)) ||
    flow.capabilities.some((c) => !sourcing[c])
  )
    throw new Error("Choisissez une option pour chaque capacité.");
  const existing = audit.installations.find((i) => i.flowId === flowId);
  if (existing) {
    existing.sourcing = sourcing;
    return { missionId: existing.missionId, reused: true };
  }
  const stamp = new Date().toISOString();
  const missionId = id("mission");
  const versionId = id("mv");
  const sourceId = id("src");
  const initialRequest = `${flow.title}\nEntreprise : ${audit.company}\nActivité : ${audit.description}\nRésultat recherché : ${audit.success}\nVolume : ${audit.volume}\nContraintes : ${audit.constraints || "À préciser"}\nPréparer : ${flow.output}\nVérifier : ${flow.acceptance}\nSi les pièces nécessaires (${flow.input}) ne sont pas fournies, demander les informations manquantes. Ne pas inventer leur contenu.`;
  state.sources.unshift({
    id: sourceId,
    tenantId: audit.tenantId,
    name: `${audit.company} · contexte déclaré`,
    kind: "profile",
    status: "ready",
    origin: `audit:${audit.id}`,
    excerpt: initialRequest,
    version: "1",
    required: true,
    createdAt: stamp,
  });
  const mission: Mission = {
    id: missionId,
    tenantId: audit.tenantId,
    flowId,
    auditId,
    initialRequest,
    packageSlug: flow.engine,
    packageVersion: "1.0.0",
    name: `${flow.title} · ${audit.company}`,
    state: "configuring",
    draftVersionId: versionId,
    createdAt: stamp,
    updatedAt: stamp,
  };
  const version: MissionVersion = {
    id: versionId,
    tenantId: audit.tenantId,
    missionId,
    version: 1,
    immutable: false,
    outcome: flow.output,
    instructions: `${flow.steps.join("\n")}\n${flow.approval}\n${flow.memory}\nContraintes client : ${audit.constraints}\nLes préférences de fournisseur ne prouvent aucune connexion. Aucun accès aux outils externes n'est disponible dans ce contrat documentaire.`,
    knowledgeSourceIds: [sourceId],
    tools: [],
    operatingMode: "test",
    budgetEur: 0.5,
    approvalPolicy: "always_external",
    createdAt: stamp,
  };
  state.missions.unshift(mission);
  state.missionVersions.unshift(version);
  audit.installations.push({ flowId, missionId, sourcing });
  return { missionId, reused: false };
}
