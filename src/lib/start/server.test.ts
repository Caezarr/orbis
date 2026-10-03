import { describe, expect, it, vi } from "vitest";
import type { StoreState } from "@/lib/domain/types";
import { blankTenantState } from "@/lib/platform/request";
import { profileFromSite } from "./flow";
import { connectMailbox, verifyMailbox } from "./server";
import { applyStartProfile, toCompanyProfile } from "./workspace";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const identity = { tenantId: "t1", workspaceId: "w1" };

describe("verifyMailbox", () => {
  it("reports not_configured without calling the provider", async () => {
    const accounts = vi.fn();
    expect(await verifyMailbox("gmail", identity, { configured: () => false, accounts })).toEqual({
      status: "not_configured",
      accounts: 0,
    });
    expect(accounts).not.toHaveBeenCalled();
  });
  it("is connected only when the server finds an active account, and records the milestone", async () => {
    const record = vi.fn(async () => true);
    const accounts = vi.fn(async () => ["ca_1"]);
    expect(await verifyMailbox("outlook", identity, { configured: () => true, accounts, record })).toEqual({
      status: "connected",
      accounts: 1,
    });
    expect(accounts).toHaveBeenCalledWith("outlook", "t1", "w1");
    expect(record).toHaveBeenCalledWith("mailbox_connected");
  });
  it("does not record anything when no account is active", async () => {
    const record = vi.fn();
    expect(
      await verifyMailbox("gmail", identity, { configured: () => true, accounts: async () => [], record }),
    ).toEqual({ status: "not_connected", accounts: 0 });
    expect(record).not.toHaveBeenCalled();
  });
  it("maps provider failures to error, never connected", async () => {
    expect(
      await verifyMailbox("gmail", identity, { configured: () => true, accounts: async () => Promise.reject(new Error("x")) }),
    ).toEqual({ status: "error", accounts: 0 });
  });
});

describe("connectMailbox", () => {
  it("links the workspace user and returns to /start with only the provider name", async () => {
    const link = vi.fn(async () => ({ redirectUrl: "https://connect.composio.dev/x" }));
    const result = await connectMailbox("gmail", identity, "https://app.example", { configured: () => true, link });
    expect(result).toEqual({ redirectUrl: "https://connect.composio.dev/x" });
    expect(link).toHaveBeenCalledWith("orbis:t1:w1", "gmail", "https://app.example/start?connected=gmail");
  });
  it("refuses unconfigured providers", async () => {
    const link = vi.fn();
    expect(await connectMailbox("outlook", identity, "https://app.example", { configured: () => false, link })).toEqual({
      error: "provider_not_configured",
    });
    expect(link).not.toHaveBeenCalled();
  });
});

describe("workspace profile", () => {
  const profile = profileFromSite({
    website: "https://atelier.fr/",
    title: "Atelier",
    description: "Menuiserie sur mesure pour particuliers et professionnels.",
    excerpt: "",
  });
  it("stores facts as sourced claims and unknowns as missing", () => {
    const c = toCompanyProfile({ ...profile, facts: [...profile.facts, { label: "x", quote: "yy", sourceUrl: "https://evil.example/" }] }, "t1");
    expect(c.tenantId).toBe("t1");
    expect(c.claims.filter((x) => x.kind === "missing")).toHaveLength(profile.unknowns.length);
    const foreign = c.claims.find((x) => x.value === "yy");
    expect(foreign?.sourceUrl).toBeUndefined();
    expect(c.claims.find((x) => x.label === "Description du site")?.sourceUrl).toBe("https://atelier.fr/");
  });
  it("names only a default-named workspace and keeps one profile source", () => {
    const state: StoreState = blankTenantState({
      id: "w1",
      tenantId: "t1",
      name: "My workspace",
      slug: "w",
      createdAt: "2026-10-02T00:00:00.000Z",
    });
    applyStartProfile(state, profile);
    applyStartProfile(state, { ...profile, name: "Atelier 2" });
    expect(state.workspace.name).toBe("Atelier");
    expect(state.profile?.name).toBe("Atelier 2");
    expect(state.sources.filter((x) => x.kind === "profile")).toHaveLength(1);
    expect(state.workspace.tenantId).toBe("t1");
  });
});
