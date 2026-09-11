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
          data: { access_token: "private" },
        },
      ],
    });
    expect(await connectionStatus("workspace-user", "gmail")).toEqual({
      status: "connected",
    });
    expect(sdk.list.mock.calls[0][0]).toMatchObject({
      userIds: ["workspace-user"],
      authConfigIds: ["auth-test"],
      toolkitSlugs: ["gmail"],
    });
  });
  it("does not accept a disabled connection", async () => {
    sdk.list.mockResolvedValue({
      items: [{ status: "ACTIVE", isDisabled: true }],
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
});
