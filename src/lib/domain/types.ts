export type Maturity =
  "planned" | "composable" | "ready" | "supervised" | "autonomy_scoped";

export type MissionState =
  | "draft"
  | "configuring"
  | "testing"
  | "ready"
  | "active"
  | "paused"
  | "archived";

export type RunState =
  | "queued"
  | "running"
  | "waiting_input"
  | "waiting_approval"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "needs_reconciliation";

export type RuntimeMode = "test" | "supervised" | "scoped_autonomy";

export type ClaimKind = "fact" | "hypothesis" | "missing";

export type CorrectionScope = "this_result" | "this_customer" | "general_rule";

export type MemoryKind =
  | "working"
  | "episodic"
  | "semantic"
  | "procedural"
  | "preference"
  | "organizational";

export type ActionState =
  | "planned"
  | "policy_checked"
  | "approval_required"
  | "approved"
  | "executing"
  | "succeeded"
  | "failed"
  | "uncertain";

export type Workspace = {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  createdAt: string;
};

export type Membership = {
  id: string;
  tenantId: string;
  workspaceId: string;
  userId: string;
  name: string;
  email: string;
  role: "owner" | "operator" | "admin" | "expert";
};

export type ProfileClaim = {
  id: string;
  kind: ClaimKind;
  label: string;
  value: string;
  sourceUrl?: string;
  confidence: number;
};

export type CompanyProfile = {
  id: string;
  tenantId: string;
  name: string;
  website?: string;
  summary: string;
  industry?: string;
  size?: string;
  region?: string;
  tags: string[];
  claims: ProfileClaim[];
  input: string;
  completedAt?: string;
};

export type CrewRole = {
  id: string;
  role: string;
  goal: string;
  cannot: string[];
};

export type CrewSpec = {
  process: "sequential" | "hierarchical";
  department: "Growth" | "Sales" | "Operations" | "Customer Care" | "Finance";
  whyNow: string;
  roles: CrewRole[];
};

export type Signal = {
  id: string;
  slug: string;
  title: string;
  whyNow: string;
  evidence: string;
  strength: number;
};

export type CopilotItem = {
  id: string;
  title: string;
  when: string;
  missionId: string;
  kind: "run" | "approval" | "test";
};

export type Impact = {
  hoursSaved: number;
  acceptedResultCostEur: number;
  secondCapabilityMinutes: number;
  correctionRate: number;
  runsThisWeek: number;
};

export type CapabilityPackage = {
  slug: string;
  version: string;
  name: string;
  outcome: string;
  description: string;
  maturity: Maturity;
  owner: string;
  category: string;
  roles: string[];
  tools: string[];
  industries: string[];
  inputs: string[];
  outputs: string[];
  requiredKnowledge: string[];
  externalEffects: string[];
  evaluations: string[];
  exampleInput: string;
  exampleResult: string;
  testTime: string;
  firstUsefulResult: string;
  protocol: string[];
  costBoundEur: number;
  risks: string[];
  approvalPoints: string[];
  failureModes: string[];
  deprecationPolicy: string;
};

export type Mission = {
  flowId?: string;
  auditId?: string;
  initialRequest?: string;
  id: string;
  tenantId: string;
  packageSlug: string;
  packageVersion: string;
  name: string;
  state: MissionState;
  activeVersionId?: string;
  draftVersionId: string;
  createdAt: string;
  updatedAt: string;
};

export type MissionVersion = {
  id: string;
  tenantId: string;
  missionId: string;
  version: number;
  immutable: boolean;
  outcome: string;
  knowledgeSourceIds: string[];
  instructions: string;
  tools: string[];
  operatingMode: RuntimeMode;
  budgetEur: number;
  approvalPolicy: "never_for_test" | "always_external" | "threshold";
  createdAt: string;
};

export type Source = {
  id: string;
  tenantId: string;
  name: string;
  kind: "website" | "upload" | "connection" | "fixture" | "profile";
  status: "ready" | "ingesting" | "stale" | "revoked";
  origin: string;
  excerpt: string;
  version: string;
  required: boolean;
  createdAt: string;
};

export type Instruction = {
  id: string;
  tenantId: string;
  title: string;
  body: string;
  scope: "workspace" | "mission" | "customer";
  provenance: string;
  status: "draft" | "approved";
};

export type MemoryItem = {
  missionId?: string;
  runId?: string;
  id: string;
  tenantId: string;
  kind: MemoryKind;
  title: string;
  body: string;
  scope: CorrectionScope | "workspace";
  source: string;
  owner: string;
  confidence: number;
  status: "proposed" | "approved" | "rejected";
  customerKey?: string;
  createdAt: string;
};

export type Connection = {
  id: string;
  tenantId: string;
  provider: string;
  label: string;
  status: "connected" | "needs_auth" | "revoked" | "error";
  scopes: string[];
  secretRef: string;
  health: string;
};

export type CheckResult = {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
};

export type Citation = {
  sourceId: string;
  sourceName: string;
  excerpt: string;
  locator?: string;
};

export type Artifact = {
  id: string;
  tenantId: string;
  runId: string;
  kind: "brief" | "reply" | "draft" | "analysis" | "questions" | "export";
  title: string;
  body: string;
  citations: Citation[];
  unknowns: string[];
};

export type EvaluationReport = {
  id: string;
  tenantId: string;
  runId: string;
  packageSlug: string;
  checks: CheckResult[];
  score: number;
  humanFeedback?: {
    accepted: boolean;
    correction?: string;
    scope?: CorrectionScope;
    note?: string;
  };
  gatePassed: boolean;
};

export type StepRun = {
  id: string;
  name: string;
  status: "queued" | "running" | "succeeded" | "denied" | "failed";
  detail: string;
  startedAt: string;
  endedAt?: string;
  role?: string;
  tokens?: number;
  durationMs?: number;
};

export type Run = {
  engine?: "agent-v1";
  requestKey?: string;
  requestHash?: string;
  error?: string;
  usage?: { inputTokens: number; outputTokens: number; costKnown: boolean };
  id: string;
  tenantId: string;
  missionId: string;
  missionVersionId: string;
  caseId?: string;
  mode: RuntimeMode;
  state: RunState;
  workflowId: string;
  policyVersion: string;
  policyHash: string;
  traceId: string;
  inputText: string;
  inputRefs: string[];
  artifactIds: string[];
  evaluationId?: string;
  steps: StepRun[];
  cost: { provider: number; platform: number; currency: "EUR" };
  model: string;
  createdAt: string;
  completedAt?: string;
};

export type Approval = {
  id: string;
  tenantId: string;
  actionId: string;
  runId: string;
  payloadHash: string;
  status: "pending" | "approved" | "rejected" | "expired";
  preview: string;
  consequence: string;
  estimatedCostEur: number;
  expiresAt: string;
  decidedAt?: string;
};

export type ExternalAction = {
  id: string;
  tenantId: string;
  runId: string;
  kind: string;
  state: ActionState;
  payload: Record<string, unknown>;
  payloadHash: string;
  idempotencyKey: string;
  approvalId?: string;
};

export type BudgetReservation = {
  id: string;
  tenantId: string;
  runId: string;
  amountEur: number;
  status: "reserved" | "settled" | "released";
};

export type UsageEntry = {
  id: string;
  tenantId: string;
  runId: string;
  kind: "provider" | "platform" | "connector" | "human_review";
  amountEur: number;
  note: string;
  createdAt: string;
};

export type AuditEvent = {
  id: string;
  tenantId: string;
  actor: string;
  action: string;
  target: string;
  result: string;
  policyHash?: string;
  traceId?: string;
  createdAt: string;
};

export type OutboxEvent = {
  id: string;
  tenantId: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type TestCase = {
  id: string;
  tenantId: string;
  packageSlug: string;
  title: string;
  customer?: string;
  body: string;
  historical: boolean;
};

export type DecisionCard = {
  id: string;
  tenantId: string;
  missionId: string;
  runId?: string;
  approvalId?: string;
  title: string;
  missionName: string;
  reason: string;
  source: string;
  estimatedCostEur: number;
  consequence: string;
  createdAt: string;
  kind: "review" | "approve" | "inspect";
  whyNow?: string;
};

export type StoreState = {
  businessAudits?: import("@/lib/product/audit").BusinessAudit[];
  knowledgeSelections?: import("@/lib/product/knowledge-scopes").KnowledgeSelection[];
  workspace: Workspace;
  memberships: Membership[];
  profile: CompanyProfile | null;
  packages: CapabilityPackage[];
  missions: Mission[];
  missionVersions: MissionVersion[];
  sources: Source[];
  instructions: Instruction[];
  memory: MemoryItem[];
  connections: Connection[];
  runs: Run[];
  artifacts: Artifact[];
  evaluations: EvaluationReport[];
  approvals: Approval[];
  actions: ExternalAction[];
  budgets: BudgetReservation[];
  usage: UsageEntry[];
  audit: AuditEvent[];
  outbox: OutboxEvent[];
  cases: TestCase[];
  decisions: DecisionCard[];
  signals: Signal[];
  copilot: CopilotItem[];
  impact: Impact;
};
