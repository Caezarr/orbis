import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildSeed } from "@/lib/store/seed";
import type { Source } from "@/lib/domain/types";
import {
  retrieveKnowledge,
  resolveApprovedMemory,
  type KnowledgeMemory,
} from "./index";

function fixture() {
  const state = buildSeed();
  const source: Source = {
    id: "allowed",
    tenantId: state.workspace.tenantId,
    name: "Policy",
    kind: "upload",
    status: "ready",
    origin: "upload://policy",
    excerpt: "Cancellation refund policy: refunds within seven days.",
    version: "v1",
    required: false,
    createdAt: "2026-09-01T00:00:00Z",
  };
  state.sources = [source];
  state.memory = [];
  const mission = state.missions[0];
  mission.activeVersionId = undefined;
  const version = state.missionVersions.find(
    (v) => v.id === mission.draftVersionId,
  )!;
  version.knowledgeSourceIds = [source.id];
  return { state, source, mission, version };
}

describe("source-scoped lexical retrieval", () => {
  it("cites the current version and exact excerpt", () => {
    const { state, source } = fixture();
    const [hit] = retrieveKnowledge({
      state,
      query: "refund",
      sourceIds: [source.id],
    });
    expect(hit).toMatchObject({
      sourceId: source.id,
      sourceVersion: "v1",
      version: "v1",
      createdAt: source.createdAt,
      excerpt: source.excerpt,
    });
    expect(hit.score).toBeGreaterThan(0);
  });
  it("filters foreign and unselected content before computing BM25 scores", () => {
    const { state, source } = fixture();
    const args = { state, query: "refund", sourceIds: [source.id, "foreign"] };
    const baseline = retrieveKnowledge(args);
    state.sources.push(
      {
        ...source,
        id: "foreign",
        tenantId: "other",
        excerpt: "refund ".repeat(100),
      },
      { ...source, id: "private", excerpt: "refund ".repeat(100) },
    );
    expect(retrieveKnowledge(args)).toEqual(baseline);
  });
  it.each(["revoked", "stale", "ingesting"] as const)(
    "excludes %s sources",
    (status) => {
      const { state, source } = fixture();
      source.status = status;
      expect(
        retrieveKnowledge({ state, query: "refund", sourceIds: [source.id] }),
      ).toEqual([]);
    },
  );
  it("does not return deleted or superseded content on subsequent calls", () => {
    const { state, source } = fixture();
    const args = { state, query: "refund", sourceIds: [source.id] };
    expect(retrieveKnowledge(args)).toHaveLength(1);
    source.version = "v2";
    source.excerpt = "No cancellation terms available.";
    expect(retrieveKnowledge(args)).toEqual([]);
    state.sources = [];
    expect(retrieveKnowledge(args)).toEqual([]);
  });
  it("intersects mission scope before ranking and denies foreign/missing missions", () => {
    const { state, source, mission } = fixture();
    state.sources.push({ ...source, id: "outside" });
    const args = {
      state,
      query: "refund",
      sourceIds: [source.id, "outside"],
      missionId: mission.id,
    };
    expect(retrieveKnowledge(args).map((x) => x.sourceId)).toEqual([source.id]);
    mission.tenantId = "other";
    expect(retrieveKnowledge(args)).toEqual([]);
    expect(retrieveKnowledge({ ...args, missionId: "missing" })).toEqual([]);
  });
  it("does not fall back to a draft when the active version has no access", () => {
    const { state, source, mission, version } = fixture();
    mission.activeVersionId = "active";
    state.missionVersions.push({
      ...version,
      id: "active",
      knowledgeSourceIds: [],
    });
    expect(
      retrieveKnowledge({
        state,
        query: "refund",
        sourceIds: [source.id],
        missionId: mission.id,
      }),
    ).toEqual([]);
  });
  it("requires an explicit selection and handles blank or unmatched queries", () => {
    const { state, source } = fixture();
    for (const query of ["", "!!!", "unmatched"])
      expect(
        retrieveKnowledge({ state, query, sourceIds: [source.id] }),
      ).toEqual([]);
    expect(
      retrieveKnowledge({ state, query: "refund", sourceIds: [] }),
    ).toEqual([]);
  });
  it("normalizes accents without changing cited text, and bounds snippets", () => {
    const { state, source } = fixture();
    source.excerpt =
      "prefix ".repeat(200) + "RÉSERVATION remboursée " + "suffix ".repeat(200);
    const [hit] = retrieveKnowledge({
      state,
      query: "reservation",
      sourceIds: [source.id],
    });
    expect(hit.excerpt).toContain("RÉSERVATION");
    expect(source.excerpt).toContain(hit.excerpt);
    expect(hit.excerpt.length).toBeLessThanOrEqual(700);
  });
  it("ranks lexical matches and applies limits", () => {
    const { state, source } = fixture();
    state.sources.push({
      ...source,
      id: "strong",
      excerpt: "refund refund refund",
    });
    const args = { state, query: "refund", sourceIds: [source.id, "strong"] };
    expect(
      retrieveKnowledge({ ...args, limit: 1 }).map((x) => x.sourceId),
    ).toEqual(["strong"]);
    expect(retrieveKnowledge({ ...args, limit: 0 })).toEqual([]);
    expect(retrieveKnowledge({ ...args, limit: NaN })).toEqual([]);
  });
});

function memoryFixture() {
  const data = fixture();
  const item: KnowledgeMemory = {
    id: "memory",
    tenantId: data.state.workspace.tenantId,
    kind: "organizational",
    title: "Refund window",
    body: "Seven days",
    scope: "workspace",
    source: "Policy",
    owner: "operator",
    confidence: 1,
    status: "approved",
    createdAt: data.source.createdAt,
    sourceRefs: [{ sourceId: data.source.id, sourceVersion: "v1" }],
  };
  data.state.memory = [item];
  return {
    ...data,
    item,
    context: {
      state: data.state,
      sourceIds: [data.source.id],
      now: new Date("2026-09-12T00:00:00Z"),
    },
  };
}

describe("approved memory validity and conflicts", () => {
  it("only returns approved tenant memory", () => {
    const { context, item } = memoryFixture();
    expect(resolveApprovedMemory(context).items).toHaveLength(1);
    item.status = "proposed";
    expect(resolveApprovedMemory(context).items).toEqual([]);
    item.status = "approved";
    item.tenantId = "other";
    expect(resolveApprovedMemory(context).items).toEqual([]);
  });
  it.each(["2026-09-12T00:00:00Z", "2026-01-01T00:00:00Z", "invalid"])(
    "excludes expired/invalid memory %s",
    (expiresAt) => {
      const { context, item } = memoryFixture();
      item.expiresAt = expiresAt;
      expect(resolveApprovedMemory(context).items).toEqual([]);
    },
  );
  it("excludes not-yet-valid memory", () => {
    const { context, item } = memoryFixture();
    item.validFrom = "2027-01-01T00:00:00Z";
    expect(resolveApprovedMemory(context).items).toEqual([]);
  });
  it("requires current accessible source versions", () => {
    const { context, source } = memoryFixture();
    expect(resolveApprovedMemory({ ...context, sourceIds: [] }).items).toEqual(
      [],
    );
    source.version = "v2";
    expect(resolveApprovedMemory(context).items).toEqual([]);
    source.version = "v1";
    source.status = "revoked";
    expect(resolveApprovedMemory(context).items).toEqual([]);
    context.state.sources = [];
    expect(resolveApprovedMemory(context).items).toEqual([]);
  });
  it("reports conflicting approved claims without choosing a winner", () => {
    const { context, item } = memoryFixture();
    context.state.memory.push({ ...item, id: "conflict", body: "Thirty days" });
    expect(resolveApprovedMemory(context)).toEqual({
      items: [],
      conflicts: [{ key: "refund window", memoryIds: ["memory", "conflict"] }],
    });
    context.state.memory[1].status = "rejected";
    expect(resolveApprovedMemory(context).items).toHaveLength(1);
  });
  it("does not expose conflicts from another tenant", () => {
    const { context, item } = memoryFixture();
    context.state.memory.push({
      ...item,
      id: "secret",
      tenantId: "other",
      body: "Thirty days",
    });
    expect(resolveApprovedMemory(context).conflicts).toEqual([]);
  });
  it("enforces mission, customer and result scopes", () => {
    const { context, item, mission } = memoryFixture();
    item.missionId = mission.id;
    item.scope = "general_rule";
    expect(resolveApprovedMemory(context).items).toEqual([]);
    const scoped = { ...context, missionId: mission.id };
    expect(resolveApprovedMemory(scoped).items).toHaveLength(1);
    item.scope = "this_customer";
    item.customerKey = "customer-a";
    expect(
      resolveApprovedMemory({ ...scoped, customerKey: "customer-b" }).items,
    ).toEqual([]);
    expect(
      resolveApprovedMemory({ ...scoped, customerKey: "customer-a" }).items,
    ).toHaveLength(1);
    item.scope = "this_result";
    item.runId = "run-a";
    expect(resolveApprovedMemory(scoped).items).toEqual([]);
    expect(
      resolveApprovedMemory({ ...scoped, runId: "run-a" }).items,
    ).toHaveLength(1);
  });
});

vi.mock("@/lib/store/store", () => ({ getStore: vi.fn() }));
describe("knowledge search request boundary", () => {
  beforeEach(() => {
    vi.stubEnv("ORBIS_OFFLINE", "true");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("APP_ORIGIN", "http://localhost");
  });
  afterEach(() => vi.unstubAllEnvs());
  it("rejects cross-origin requests even in explicit offline mode", async () => {
    const { POST } = await import("@/app/api/v1/knowledge-search/route");
    const response = await POST(
      new Request("http://localhost/api/v1/knowledge-search", {
        method: "POST",
        headers: { origin: "https://attacker.example" },
        body: JSON.stringify({ query: "refund", sourceIds: [] }),
      }),
    );
    expect(response.status).toBe(403);
  });
  it("rejects malformed requests and caller-supplied tenants", async () => {
    const { POST } = await import("@/app/api/v1/knowledge-search/route");
    for (const body of [
      "{",
      JSON.stringify({ query: "refund" }),
      JSON.stringify({ query: "refund", sourceIds: [], tenantId: "other" }),
    ]) {
      expect(
        (
          await POST(
            new Request("http://localhost/api/v1/knowledge-search", {
              method: "POST",
              headers: { origin: "http://localhost" },
              body,
            }),
          )
        ).status,
      ).toBe(400);
    }
  });
  it("returns evidence from server state with no-store headers", async () => {
    const { POST } = await import("@/app/api/v1/knowledge-search/route");
    const { getStore } = await import("@/lib/store/store");
    const { state, source } = fixture();
    vi.mocked(getStore).mockReturnValue(state);
    const response = await POST(
      new Request("http://localhost/api/v1/knowledge-search", {
        method: "POST",
        headers: { origin: "http://localhost" },
        body: JSON.stringify({ query: "refund", sourceIds: [source.id] }),
      }),
    );
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toMatchObject({
      method: "lexical-bm25",
      items: [{ sourceVersion: "v1" }],
    });
  });
});
