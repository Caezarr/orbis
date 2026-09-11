import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildSeed } from "@/lib/store/seed";
import type { StoreState } from "@/lib/domain/types";
const state = vi.hoisted(() => ({ current: null as StoreState | null }));
vi.mock("@/lib/store/store", () => ({
  getStore: () => state.current,
  mutateStore: (fn: (s: StoreState) => unknown) => fn(state.current!),
}));
import { POST, GET } from "./route";
function request(body: unknown, origin = "http://localhost:3002") {
  return new Request("http://localhost:3002/api/v1/team", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  state.current = buildSeed();
});
describe("workspace directory", () => {
  it("rejects cross-origin writes", async () => {
    expect(
      (
        await POST(
          request(
            {
              action: "member",
              name: "Test User",
              email: "test@example.com",
              role: "admin",
            },
            "https://other.example",
          ),
        )
      ).status,
    ).toBe(403);
  });
  it("rejects invalid role and email", async () => {
    expect(
      (
        await POST(
          request({
            action: "member",
            name: "Test User",
            email: "invalid",
            role: "owner",
          }),
        )
      ).status,
    ).toBe(400);
  });
  it("saves a directory member and rejects duplicate emails", async () => {
    const body = {
      action: "member",
      name: "Test User",
      email: "test@example.com",
      role: "operator",
    };
    expect((await POST(request(body))).status).toBe(201);
    expect((await POST(request(body))).status).toBe(409);
  });
  it("validates group membership and returns saved groups", async () => {
    expect(
      (
        await POST(
          request({ action: "group", name: "Support", memberIds: ["unknown"] }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await POST(
          request({
            action: "group",
            name: "Support",
            memberIds: [state.current!.memberships[0].id],
          }),
        )
      ).status,
    ).toBe(201);
    expect((await (await GET()).json()).groups).toHaveLength(1);
  });
});
