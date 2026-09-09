import { id } from "@/lib/ids";
import { nowIso } from "@/lib/time";
import { hashPayload } from "@/lib/ssrf";
import { brokerDecide } from "@/lib/runtime/broker";
import { evaluateRun, memoryHints } from "@/lib/runtime/evaluators";
import { getPackage } from "@/lib/capabilities/registry";
import { getCrew } from "@/lib/capabilities/crews";
import { getStore, mutateStore } from "@/lib/store/store";
import type {
  Artifact,
  Citation,
  CorrectionScope,
  Mission,
  MissionVersion,
  Run,
  RuntimeMode,
  Source,
  StepRun,
} from "@/lib/domain/types";

function citationsFrom(sources: Source[]): Citation[] {
  return sources.slice(0, 4).map((source) => ({
    sourceId: source.id,
    sourceName: source.name,
    excerpt: source.excerpt,
    locator: source.origin,
  }));
}

function produce(input: {
  slug: string;
  text: string;
  sources: Source[];
  instructions: string;
  memory: string[];
}) {
  const { slug, text, sources, instructions, memory } = input;
  const cites = citationsFrom(sources);
  const joinedMemory = memory.join(" ");

  if (slug === "request-analysis") {
    const french = /bonjour|merci|cordialement|chantier/i.test(text);
    const weekend = /week-end|weekend/i.test(text);
    const body = french
      ? `Bonjour Claire,\n\nNous avons bien reçu votre demande pour le chantier Lyon-Confluence (12 licences, mise en service sous 48h).\n\nNous pouvons préparer le déploiement des licences et l’onboarding site. ${
          weekend
            ? "La couverture week-end n’est pas dans le catalogue approuvé : nous ne pouvons pas en confirmer le tarif ici."
            : "Le délai de mise en service standard n’est pas encore dans le profil entreprise."
        }\n\nUn chef de projet dédié n’est pas décrit dans les sources actuelles.\n\nPouvez-vous confirmer la contrainte de livraison week-end pour que nous puissions faire valider une offre ?\n\nCordialement,\nAcme`
      : `Hello,\n\nWe read the request and mapped it against approved company facts. License count and onboarding are in scope. ${
          weekend ? "Weekend coverage is not in the approved catalog, so no price is stated." : "Delivery lead time is still missing from the company profile."
        }\n\nWe will not invent a fee.\n\nAcme`;
    return {
      title: "Prepared response",
      kind: "reply" as const,
      body,
      citations: cites,
      unknowns: [
        weekend ? "Weekend coverage terms and pricing" : "Standard rollout lead time",
        "Whether a dedicated project manager is included",
      ],
    };
  }

  if (slug === "meeting-prep") {
    return {
      title: "Meeting brief",
      kind: "brief" as const,
      body: `Brief\n\n${text}\n\nWe can speak to product scope from the company profile. Do not invent titles or commercial terms.\n\nQuestions\n1. What does success look like for this site in 30 days?\n2. Who signs and who operates?\n3. Is weekend coverage actually required?\n\nInstruction in force: ${instructions.slice(0, 140)}`,
      citations: cites,
      unknowns: ["Exact attendee title", "Decision timeline"],
    };
  }

  if (slug === "content-draft") {
    return {
      title: "LinkedIn draft",
      kind: "draft" as const,
      body: `Most construction SMEs do not have a quoting problem. They have a rework problem.\n\nA week a month disappears into versions that were never tied to an approved catalog.\n\nWe draft from what is sourced. Two claims still need confirmation before this can go out:\n— “a week a month” is a hypothesis, not a measured Acme figure.\n— “approved catalog” is company process, not a public stat.\n\nVariant / newsletter: same argument, longer, with a single customer-shaped example and no invented ROI.\n\n${joinedMemory ? `Applied rule: ${joinedMemory}` : ""}`,
      citations: cites,
      unknowns: ["Measured time lost to quote rework", "Named customer permission to cite"],
    };
  }

  return {
    title: "Research brief",
    kind: "brief" as const,
    body: `Question\n${text}\n\nFindings\n1. Public construction-software buying in France clusters around framework agreements and site-operations tools — treat vendor claims as unverified until cited.\n2. Buyers ask for eligibility, security, and delivery constraints before price.\n3. Weekend / on-site coverage is often a hidden requirement and a common source of invented quotes.\n\nThese points are prioritized for action, not completeness.`,
    citations: cites,
    unknowns: ["Current quarter winners (needs a live tender source)", "Exact scoring criteria"],
  };
}

function stepsFor(slug: string, mode: RuntimeMode): StepRun[] {
  const stamp = nowIso();
  const pkg = getPackage(slug);
  const crew = getCrew(slug);
  const protocol = pkg?.protocol ?? ["Research", "Draft", "Verify"];
  const steps: StepRun[] = protocol.map((name, index) => {
    const role = crew.roles[Math.min(index, crew.roles.length - 1)];
    return {
      id: id("step"),
      name,
      status: "succeeded" as const,
      detail: `${role.role}: ${role.goal}. Cannot: ${role.cannot.join(", ")}.`,
      startedAt: stamp,
      endedAt: stamp,
      role: role.role,
      tokens: 420 + index * 80,
      durationMs: 900 + index * 400,
    };
  });
  const writeProbe = brokerDecide("send_email", mode);
  steps.push({
    id: id("step"),
    name: "Tool broker",
    status: writeProbe.allowed ? "succeeded" : "denied",
    detail: writeProbe.allowed
      ? `send_email allowed in ${mode}`
      : `${writeProbe.code}: ${writeProbe.detail}`,
    startedAt: stamp,
    endedAt: stamp,
    role: "Policy",
    tokens: 0,
    durationMs: 40,
  });
  return steps;
}

export function createMissionFromPackage(slug: string, tenantId: string) {
  const pkg = getPackage(slug);
  if (!pkg) throw new Error("Unknown package");
  return mutateStore((state) => {
    const missionId = id("mission");
    const versionId = id("mv");
    const version: MissionVersion = {
      id: versionId,
      tenantId,
      missionId,
      version: 1,
      immutable: false,
      outcome: pkg.outcome,
      knowledgeSourceIds: state.sources.filter((s) => s.required || s.kind === "profile").map((s) => s.id),
      instructions: "Use approved sources. Name unknowns. Never invent prices. No external writes in test mode.",
      tools: pkg.tools,
      operatingMode: "test",
      budgetEur: pkg.costBoundEur,
      approvalPolicy: pkg.externalEffects.length ? "always_external" : "never_for_test",
      createdAt: nowIso(),
    };
    const mission: Mission = {
      id: missionId,
      tenantId,
      packageSlug: pkg.slug,
      packageVersion: pkg.version,
      name: pkg.name,
      state: "configuring",
      draftVersionId: versionId,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    state.missions.unshift(mission);
    state.missionVersions.unshift(version);
    state.audit.unshift({
      id: id("aud"),
      tenantId,
      actor: "user_gabriel",
      action: "mission.create",
      target: missionId,
      result: "ok",
      createdAt: nowIso(),
    });
    return { mission, version };
  });
}

export function runTest(input: {
  missionId: string;
  caseId?: string;
  text?: string;
  idempotencyKey?: string;
  mode?: RuntimeMode;
}) {
  const state = getStore();
  const mission = state.missions.find((item) => item.id === input.missionId);
  if (!mission) throw new Error("Mission not found");
  const version = state.missionVersions.find((item) => item.id === mission.draftVersionId || item.id === mission.activeVersionId);
  if (!version) throw new Error("Mission version not found");
  const pkg = getPackage(mission.packageSlug);
  if (!pkg) throw new Error("Package not found");
  const mode = input.mode ?? version.operatingMode ?? "test";

  const testCase = input.caseId
    ? state.cases.find((item) => item.id === input.caseId)
    : state.cases.find((item) => item.packageSlug === mission.packageSlug);
  const text = input.text?.trim() || testCase?.body || pkg.exampleInput;
  const sources = state.sources.filter(
    (source) => version.knowledgeSourceIds.includes(source.id) || source.kind === "profile",
  );
  const mem = memoryHints(state.memory);

  const produced = produce({
    slug: pkg.slug,
    text,
    sources,
    instructions: version.instructions,
    memory: mem,
  });

  const evals = evaluateRun({ pkg, artifact: produced, sources });
  const costProvider = Number((pkg.costBoundEur * 0.45).toFixed(2));
  const costPlatform = 0.02;
  const policyHash = hashPayload({
    version: version.id,
    mode,
    tools: version.tools,
    instructions: version.instructions,
  });

  return mutateStore((next) => {
    const runId = id("run");
    const artifactId = id("art");
    const evalId = id("eval");
    const reservationId = id("bud");
    const stamp = nowIso();

    const artifact: Artifact = {
      id: artifactId,
      tenantId: mission.tenantId,
      runId,
      kind: produced.kind,
      title: produced.title,
      body: produced.body,
      citations: produced.citations,
      unknowns: produced.unknowns,
    };

    const run: Run = {
      id: runId,
      tenantId: mission.tenantId,
      missionId: mission.id,
      missionVersionId: version.id,
      caseId: testCase?.id,
      mode,
      state: "succeeded",
      workflowId: `wf_${runId}`,
      policyVersion: "pol_mvp",
      policyHash,
      traceId: `tr_${runId}`,
      inputText: text,
      inputRefs: sources.map((s) => s.id),
      artifactIds: [artifactId],
      evaluationId: evalId,
      steps: stepsFor(pkg.slug, mode),
      cost: { provider: costProvider, platform: costPlatform, currency: "EUR" },
      model: "managed/quality-balanced",
      createdAt: stamp,
      completedAt: stamp,
    };

    next.runs.unshift(run);
    next.artifacts.unshift(artifact);
    next.evaluations.unshift({
      id: evalId,
      tenantId: mission.tenantId,
      runId,
      packageSlug: pkg.slug,
      checks: evals.checks,
      score: evals.score,
      gatePassed: evals.gatePassed,
    });
    next.budgets.unshift({
      id: reservationId,
      tenantId: mission.tenantId,
      runId,
      amountEur: version.budgetEur,
      status: "settled",
    });
    next.usage.unshift(
      {
        id: id("use"),
        tenantId: mission.tenantId,
        runId,
        kind: "provider",
        amountEur: costProvider,
        note: `${pkg.name} inference`,
        createdAt: stamp,
      },
      {
        id: id("use"),
        tenantId: mission.tenantId,
        runId,
        kind: "platform",
        amountEur: costPlatform,
        note: "Platform fee",
        createdAt: stamp,
      },
    );
    next.outbox.unshift({
      id: id("evt"),
      tenantId: mission.tenantId,
      type: "run.completed",
      payload: { runId, missionId: mission.id },
      createdAt: stamp,
    });
    next.audit.unshift({
      id: id("aud"),
      tenantId: mission.tenantId,
      actor: "user_gabriel",
      action: "mission.test",
      target: mission.id,
      result: "succeeded",
      policyHash,
      traceId: run.traceId,
      createdAt: stamp,
    });

    const missionRef = next.missions.find((item) => item.id === mission.id);
    if (missionRef) {
      missionRef.state = evals.gatePassed ? "ready" : "testing";
      missionRef.updatedAt = stamp;
    }

    if (mode !== "test") {
      const actionId = id("act");
      const approvalId = id("appr");
      const payload = { kind: "send_email", preview: produced.title };
      const payloadHash = hashPayload(payload);
      next.actions.unshift({
        id: actionId,
        tenantId: mission.tenantId,
        runId,
        kind: "send_email",
        state: "approval_required",
        payload,
        payloadHash,
        idempotencyKey: `${actionId}:${payloadHash}`,
        approvalId,
      });
      next.approvals.unshift({
        id: approvalId,
        tenantId: mission.tenantId,
        actionId,
        runId,
        payloadHash,
        status: "pending",
        preview: `Prepared external effect for ${pkg.name}. Payload hash ${payloadHash}.`,
        consequence: "Approval is bound to this payload. A change invalidates it.",
        estimatedCostEur: costProvider + costPlatform,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 12).toISOString(),
      });
      run.state = "waiting_approval";
    }

    return { run, artifact, evaluation: next.evaluations[0] };
  });
}

export function applyFeedback(input: {
  evaluationId: string;
  correction: string;
  scope: CorrectionScope;
  accepted: boolean;
}) {
  return mutateStore((state) => {
    const evaluation = state.evaluations.find((item) => item.id === input.evaluationId);
    if (!evaluation) throw new Error("Evaluation not found");
    evaluation.humanFeedback = {
      accepted: input.accepted,
      correction: input.correction,
      scope: input.scope,
      note: input.correction,
    };
    const run = state.runs.find((item) => item.id === evaluation.runId);
    const artifact = state.artifacts.find((item) => item.runId === evaluation.runId);
    if (artifact && input.correction.trim()) {
      artifact.body = input.correction.trim();
    }
    if (input.correction.trim()) {
      state.memory.unshift({
        id: id("mem"),
        tenantId: evaluation.tenantId,
        kind: input.scope === "general_rule" ? "procedural" : input.scope === "this_customer" ? "semantic" : "episodic",
        title: `Correction · ${input.scope.replace(/_/g, " ")}`,
        body: input.correction.trim(),
        scope: input.scope,
        source: `evaluation:${evaluation.id}`,
        owner: "user_gabriel",
        confidence: 0.88,
        status: "proposed",
        customerKey: input.scope === "this_customer" ? "vinci" : undefined,
        createdAt: nowIso(),
      });
    }
    state.audit.unshift({
      id: id("aud"),
      tenantId: evaluation.tenantId,
      actor: "user_gabriel",
      action: "evaluation.feedback",
      target: evaluation.id,
      result: input.accepted ? "accepted" : "corrected",
      createdAt: nowIso(),
    });
    return { evaluation, runId: run?.id };
  });
}

export function activateMission(missionId: string) {
  return mutateStore((state) => {
    const mission = state.missions.find((item) => item.id === missionId);
    if (!mission) throw new Error("Mission not found");
    const version = state.missionVersions.find((item) => item.id === mission.draftVersionId);
    if (!version) throw new Error("Version not found");
    const pkg = getPackage(mission.packageSlug);
    if (!pkg) throw new Error("Package not found");
    const membership = state.memberships[0];
    if (!membership) throw new Error("No membership");

    const latestRun = state.runs.find((item) => item.missionId === missionId);
    const evaluation = latestRun
      ? state.evaluations.find((item) => item.id === latestRun.evaluationId)
      : undefined;
    const required = state.sources.filter((source) => source.required);
    const blockers: string[] = [];
    if (!latestRun || latestRun.state === "failed") blockers.push("A successful test run is required.");
    if (evaluation && !evaluation.gatePassed) blockers.push("Evaluation gate has not passed.");
    if (required.some((source) => source.status !== "ready")) blockers.push("A required source is not ready.");
    if (pkg.maturity === "planned") blockers.push("This package is planned, not ready to activate.");
    if (version.budgetEur <= 0) blockers.push("Budget reservation is missing.");

    if (blockers.length) {
      return { ok: false as const, blockers, mission };
    }

    version.immutable = true;
    version.operatingMode = "supervised";
    mission.activeVersionId = version.id;
    mission.state = "active";
    mission.updatedAt = nowIso();
    state.audit.unshift({
      id: id("aud"),
      tenantId: mission.tenantId,
      actor: membership.userId,
      action: "mission.activate",
      target: mission.id,
      result: "active_supervised",
      createdAt: nowIso(),
    });
    state.outbox.unshift({
      id: id("evt"),
      tenantId: mission.tenantId,
      type: "mission.activated",
      payload: { missionId: mission.id, versionId: version.id },
      createdAt: nowIso(),
    });
    return { ok: true as const, blockers: [], mission };
  });
}

export function decideAction(input: { actionId: string; decision: "approved" | "rejected" }) {
  return mutateStore((state) => {
    const action = state.actions.find((item) => item.id === input.actionId);
    if (!action) throw new Error("Action not found");
    const approval = state.approvals.find((item) => item.id === action.approvalId);
    if (!approval) throw new Error("Approval not found");
    if (approval.status !== "pending") throw new Error("Approval is not pending");
    if (new Date(approval.expiresAt).getTime() < Date.now()) {
      approval.status = "expired";
      throw new Error("Approval expired");
    }
    const currentHash = hashPayload(action.payload);
    if (currentHash !== approval.payloadHash) {
      throw new Error("Payload changed — approval is invalid");
    }
    approval.status = input.decision;
    approval.decidedAt = nowIso();
    if (input.decision === "rejected") {
      action.state = "failed";
    } else {
      const mode = state.runs.find((item) => item.id === action.runId)?.mode ?? "supervised";
      const decision = brokerDecide(action.kind, mode);
      if (!decision.allowed) {
        action.state = "uncertain";
        const run = state.runs.find((item) => item.id === action.runId);
        if (run) run.state = "needs_reconciliation";
      } else {
        action.state = "succeeded";
        const run = state.runs.find((item) => item.id === action.runId);
        if (run) run.state = "succeeded";
      }
    }
    state.audit.unshift({
      id: id("aud"),
      tenantId: action.tenantId,
      actor: "user_gabriel",
      action: "approval.decided",
      target: approval.id,
      result: input.decision,
      createdAt: nowIso(),
    });
    return { action, approval };
  });
}
