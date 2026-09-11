import { describe, expect, it } from "vitest";
import { requirementStatus, solutionReadiness, solutions } from "./solutions";
describe("integration readiness", () => {
  const requirements = solutions.find(
    (s) => s.id === "customers",
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
});
