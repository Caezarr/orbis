import { describe, it, expect } from "vitest";
import { flows, departments, rankFlows } from "./catalog";
import { auditSchema, type BusinessAudit } from "./audit";
import { installFlow } from "./install";
import { estimateBill, businessMonthly } from "./pricing";
import { buildSeed } from "@/lib/store/seed";
const input = {
  company: "Atelier test",
  description:
    "Bureau d'études spécialisé dans les chantiers et les demandes de devis.",
  department: "Industrie & bâtiment",
  tools: "Drive",
  volume: "20 devis par semaine",
  success: "Préparer des devis sourcés avec les pièces manquantes.",
  constraints: "Ne rien envoyer",
  budget: 200,
  audience: "company" as const,
};
describe("product catalog", () => {
  it("prices Business seats with five included and validates bounds", () => {
    expect(businessMonthly(1)).toBe(399);
    expect(businessMonthly(5)).toBe(399);
    expect(businessMonthly(10)).toBe(594);
    expect(businessMonthly(50)).toBe(2154);
    for (const n of [0, -1, 51, 2.5, NaN, Infinity])
      expect(() => businessMonthly(n)).toThrow();
  });
  it("preserves valid seat choices in the audit and rejects invalid counts", () => {
    expect(auditSchema.parse({ ...input, seats: 10 }).seats).toBe(10);
    for (const seats of [0, 51, 1.5])
      expect(auditSchema.safeParse({ ...input, seats }).success).toBe(false);
  });
  it("contains 100 unique authored contracts across 10 departments", () => {
    expect(flows).toHaveLength(100);
    expect(departments).toHaveLength(10);
    expect(new Set(flows.map((f) => f.id)).size).toBe(100);
    expect(new Set(flows.map((f) => f.title)).size).toBe(100);
    for (const f of flows) {
      expect(f.input.length).toBeGreaterThan(10);
      expect(f.output.length).toBeGreaterThan(10);
      expect(f.acceptance.length).toBeGreaterThan(20);
      expect(f.steps).toHaveLength(4);
    }
  });
  it("rejects empty and invalid audit fields", () => {
    expect(auditSchema.safeParse(input).success).toBe(true);
    expect(
      auditSchema.safeParse({ ...input, description: "abc" }).success,
    ).toBe(false);
    expect(auditSchema.safeParse({ ...input, budget: -1 }).success).toBe(false);
    expect(
      auditSchema.safeParse({ ...input, department: "invalid" }).success,
    ).toBe(false);
  });
  it("ranks relevant flows with explicit reasons", () => {
    const matches = rankFlows(
      "préparer devis travaux métrés prix",
      "Industrie & bâtiment",
    );
    expect(matches[0].flow.title).toBe("Préparer un devis travaux");
    expect(matches[0].reason.length).toBeGreaterThan(10);
  });
  it("installs a tenant-scoped mission without copying unrelated company knowledge", () => {
    const s = buildSeed();
    const audit: BusinessAudit = {
      ...input,
      id: "audit-test",
      tenantId: s.workspace.tenantId,
      createdAt: new Date().toISOString(),
      installations: [],
    };
    s.businessAudits = [audit];
    const flow = flows[0];
    const sourcing = Object.fromEntries(
      flow.capabilities.map((c) => [c, "own" as const]),
    );
    const first = installFlow(s, audit.id, flow.id, sourcing);
    const mission = s.missions.find((m) => m.id === first.missionId)!;
    const version = s.missionVersions.find(
      (v) => v.id === mission.draftVersionId,
    )!;
    expect(version.knowledgeSourceIds).toHaveLength(1);
    expect(version.tools).toHaveLength(0);
    expect(version.operatingMode).toBe("test");
    expect(mission.initialRequest).toContain(input.company);
    expect(
      s.sources.find((src) => src.id === version.knowledgeSourceIds[0])?.origin,
    ).toBe("audit:audit-test");
    expect(installFlow(s, audit.id, flow.id, sourcing).missionId).toBe(
      first.missionId,
    );
    expect(audit.installations).toHaveLength(1);
  });
  it("refuses a foreign audit or incomplete sourcing", () => {
    const s = buildSeed();
    s.businessAudits = [
      {
        ...input,
        id: "other",
        tenantId: "another-tenant",
        createdAt: "",
        installations: [],
      },
    ];
    expect(() => installFlow(s, "other", flows[0].id, {})).toThrow();
    s.businessAudits[0].tenantId = s.workspace.tenantId;
    expect(() => installFlow(s, "other", flows[0].id, {})).toThrow(
      "chaque capacité",
    );
  });
  it("separates BYOK provider costs from managed invoices", () => {
    expect(estimateBill(149, 500, 0.1, false)).toEqual({
      platform: 149,
      provider: 50,
      managedFee: 0,
      orbis: 149,
      total: 199,
    });
    expect(estimateBill(149, 500, 0.1, true).total).toBe(209);
    expect(() => estimateBill(149, -1, 0.1, true)).toThrow();
  });
});
