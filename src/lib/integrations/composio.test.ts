import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const sdk = vi.hoisted(() => ({ list: vi.fn(), link: vi.fn(), get: vi.fn() }));
vi.mock("@composio/core", () => ({
  Composio: class {
    connectedAccounts = { list: sdk.list, link: sdk.link };
    authConfigs = { get: sdk.get };
  },
}));
import {
  integrationReadiness,
  integrationUser,
  connectionStatus,
  startConnection,
} from "./composio";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("COMPOSIO_API_KEY", "test-key");
  vi.stubEnv("COMPOSIO_AUTH_CONFIG_GMAIL", "auth-test");
  sdk.get.mockResolvedValue({ toolkit: { slug: "gmail" }, status: "ENABLED" });
});
afterEach(() => vi.unstubAllEnvs());
describe("integration boundary", () => {
  it("never includes credentials in readiness", () => {
    expect(JSON.stringify(integrationReadiness())).not.toContain("test-key");
    expect(JSON.stringify(integrationReadiness())).not.toContain("auth-test");
  });
  it("scopes account queries and strips provider credentials", async () => {
    sdk.list.mockResolvedValue({
      items: [
        {
          id: "ca1",
          status: "ACTIVE",
          isDisabled: false,
          toolkit: { slug: "gmail" },
          authConfig: { id: "auth-test", isDisabled: false },
          data: { access_token: "private" },
        },
      ],
    });
    expect(await connectionStatus("workspace-user", "gmail")).toEqual({
      status: "connected",
      verification: "provider_account_status",
      scopesVerified: false,
    });
    expect(sdk.list.mock.calls[0][0]).toMatchObject({
      userIds: ["workspace-user"],
      authConfigIds: ["auth-test"],
      toolkitSlugs: ["gmail"],
    });
  });
  it("does not accept a disabled connection", async () => {
    sdk.list.mockResolvedValue({
      items: [
        {
          status: "ACTIVE",
          isDisabled: true,
          toolkit: { slug: "gmail" },
          authConfig: { id: "auth-test", isDisabled: false },
        },
      ],
    });
    expect((await connectionStatus("user", "gmail")).status).toBe("needs_auth");
  });
  it("blocks mismatched auth config before generating a link", async () => {
    sdk.get.mockResolvedValue({ toolkit: { slug: "slack" } });
    await expect(
      startConnection("user", "gmail", "http://localhost:3002/connections"),
    ).rejects.toThrow("does not match");
    expect(sdk.link).not.toHaveBeenCalled();
  });
  it("separates tenant/workspace identities", () => {
    expect(integrationUser("a:b", "c")).not.toBe(integrationUser("a", "b:c"));
  });
  it("requires explicit toolkit mapping for newly discovered tools", async () => {
    vi.stubEnv("COMPOSIO_AUTH_CONFIG_JOBBER", "jobber-config");
    vi.stubEnv("COMPOSIO_TOOLKIT_JOBBER", "");
    expect((await connectionStatus("user", "jobber")).status).toBe(
      "not_configured",
    );
    expect(sdk.list).not.toHaveBeenCalled();
  });
  it("uses the configured provider slug for both validation and linking", async () => {
    vi.stubEnv("COMPOSIO_AUTH_CONFIG_JOBBER", "jobber-config");
    vi.stubEnv("COMPOSIO_TOOLKIT_JOBBER", "fixture_provider");
    sdk.get.mockResolvedValue({
      toolkit: { slug: "fixture_provider" },
      status: "ENABLED",
    });
    sdk.link.mockResolvedValue({ redirectUrl: "https://auth.example/link" });
    expect(
      await startConnection(
        "user",
        "jobber",
        "http://localhost:3002/connections",
      ),
    ).toEqual({ redirectUrl: "https://auth.example/link" });
    expect(sdk.link.mock.calls[0].slice(0, 3)).toEqual([
      "user",
      "jobber-config",
      { callbackUrl: "http://localhost:3002/connections" },
    ]);
  });
  it("rejects disabled auth configs and sanitizes SDK failures", async () => {
    sdk.get.mockResolvedValue({
      toolkit: { slug: "gmail" },
      status: "DISABLED",
    });
    await expect(connectionStatus("user", "gmail")).rejects.toThrow("disabled");
    sdk.get.mockRejectedValue(new Error("SECRET provider error"));
    await expect(
      startConnection("user", "gmail", "http://localhost:3002/connections"),
    ).rejects.toThrow("configuration verification failed");
    expect(sdk.list).not.toHaveBeenCalled();
  });
  it("never counts an active account from a different configuration", async () => {
    sdk.list.mockResolvedValue({
      items: [
        {
          status: "ACTIVE",
          isDisabled: false,
          toolkit: { slug: "gmail" },
          authConfig: { id: "other" },
        },
      ],
    });
    expect((await connectionStatus("user", "gmail")).status).toBe(
      "not_connected",
    );
  });
  it("follows pagination and refuses to infer status from a repeated cursor", async () => {
    sdk.list.mockResolvedValue({ items: [], nextCursor: "repeated" });
    expect((await connectionStatus("user", "gmail")).status).toBe("unverified");
    expect(sdk.list).toHaveBeenCalledTimes(2);
  });
  it("rejects an insecure authorization redirect", async () => {
    sdk.link.mockResolvedValue({ redirectUrl: "http://auth.example/link" });
    await expect(
      startConnection("user", "gmail", "http://localhost:3002/connections"),
    ).rejects.toThrow("Invalid authentication redirect");
  });
});
