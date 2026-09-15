import { describe, expect, it } from "vitest";
import { requirementStatus, solutionReadiness, solutions } from "./solutions";
import {
  integrations,
  isIntegrationSlug,
  integrationCategories,
} from "./catalog";
describe("integration readiness", () => {
  const requirements = solutions.find(
    (s) => s.id === "customer-support",
  )!.requirements;
  it("accepts one alternative rather than requiring every competing tool", () => {
    expect(
      solutionReadiness(requirements, {
        outlook: "connected",
        notion: "connected",
      }),
    ).toEqual({ connected: 2, total: 2, connectionsReady: true });
  });
  it("does not count optional tools towards required readiness", () => {
    expect(
      solutionReadiness(requirements, { slack: "connected" }).connected,
    ).toBe(0);
  });
  it.each([
    "needs_auth",
    "unverified",
    "error",
    "not_configured",
    "not_connected",
  ] as const)("does not trust %s", (state) => {
    expect(requirementStatus(requirements[0], { gmail: state }).satisfied).toBe(
      false,
    );
  });
  it("counts an alternative group once and handles revoked alternatives", () => {
    expect(
      solutionReadiness(requirements, {
        gmail: "needs_auth",
        outlook: "connected",
        googledrive: "connected",
        notion: "connected",
      }).connected,
    ).toBe(2);
  });
  it("does not label an empty plan ready", () => {
    expect(solutionReadiness([], {}).connectionsReady).toBe(false);
  });
  it("offers at least 50 unique meaningful tools across categories", () => {
    expect(integrations.length).toBeGreaterThanOrEqual(50);
    expect(new Set(integrations.map((i) => i.slug)).size).toBe(
      integrations.length,
    );
    expect(integrationCategories.length).toBeGreaterThanOrEqual(10);
    expect(integrations.every((i) => i.name && i.purpose.length > 10)).toBe(
      true,
    );
    expect(isIntegrationSlug("invented-tool")).toBe(false);
  });
  it("uses exactly the ten agreed vertical IDs and valid alternatives", () => {
    expect(solutions.map((s) => s.id).sort()).toEqual(
      [
        "rental-operations",
        "creator-studio",
        "ecommerce-operations",
        "sales-operations",
        "customer-support",
        "recruiting-operations",
        "agency-operations",
        "finance-operations",
        "professional-services",
        "field-services",
      ].sort(),
    );
    expect(
      solutions.every((s) =>
        s.requirements.every(
          (r) =>
            r.alternatives.length && r.alternatives.every(isIntegrationSlug),
        ),
      ),
    ).toBe(true);
  });
});
