import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ status: vi.fn() }));
vi.mock("@/lib/store/store", () => ({
  getStore: () => ({ workspace: { id: "workspace-a", tenantId: "tenant-a" } }),
}));
vi.mock("@/lib/integrations/composio", () => ({
  integrationReadiness: () => [
    { slug: "gmail", configured: true },
    { slug: "notion", configured: true },
    { slug: "slack", configured: false },
  ],
  integrationUser: (tenant: string, workspace: string) =>
    `${tenant}/${workspace}`,
  connectionStatus: mock.status,
}));
import { POST } from "./route";
function request(origin = "http://localhost:3002") {
  return new Request("http://localhost:3002/api/v1/integrations", {
    method: "POST",
    headers: { origin },
    body: JSON.stringify({ userId: "attacker", tenantId: "other" }),
  });
}
beforeEach(() => mock.status.mockReset());
describe("integration verification", () => {
  it("rejects cross-origin requests before calling the provider", async () => {
    expect((await POST(request("https://other.example"))).status).toBe(403);
    expect(mock.status).not.toHaveBeenCalled();
  });
  it("derives identity from server state and skips unconfigured tools", async () => {
    mock.status.mockResolvedValue({ status: "connected" });
    const body = await (await POST(request())).json();
    expect(mock.status).toHaveBeenCalledTimes(2);
    expect(mock.status).toHaveBeenCalledWith("tenant-a/workspace-a", "gmail");
    expect(body.items[2].status).toBe("not_configured");
  });
  it("isolates upstream failures without exposing secrets or inventing connection success", async () => {
    mock.status.mockImplementation(async (_user, slug) => {
      if (slug === "gmail") throw new Error("SECRET credentials");
      return { status: "connected" };
    });
    const body = await (await POST(request())).json();
    expect(body.items[0].status).toBe("error");
    expect(body.items[1].status).toBe("connected");
    expect(JSON.stringify(body)).not.toContain("SECRET");
  });
});
