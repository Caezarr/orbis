import { afterEach, describe, expect, it, vi } from "vitest";
const dispatch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/operations/dispatcher", () => ({ dispatchInboxPass: dispatch }));
import { cronAuthorization } from "./cron";
import { GET, POST } from "@/app/api/cron/inbox/route";

const SECRET = "s".repeat(40);
const req = (auth?: string, method = "GET") =>
  new Request("https://orbis.test/api/cron/inbox", {
    method,
    headers: auth === undefined ? {} : { authorization: auth },
  });
afterEach(() => {
  vi.unstubAllEnvs();
  dispatch.mockReset();
});

describe("cron authorization", () => {
  it("fails closed without a (long enough) secret", () => {
    expect(cronAuthorization(req(`Bearer ${SECRET}`), undefined)).toBe(
      "unconfigured",
    );
    expect(cronAuthorization(req("Bearer short"), "short")).toBe(
      "unconfigured",
    );
  });
  it("accepts only the exact bearer secret", () => {
    expect(cronAuthorization(req(`Bearer ${SECRET}`), SECRET)).toBe("ok");
    for (const header of [
      undefined,
      "",
      SECRET,
      `bearer ${SECRET}`,
      `Bearer ${SECRET}x`,
      `Bearer ${SECRET.slice(1)}`,
      "Basic abc",
    ])
      expect(cronAuthorization(req(header), SECRET)).toBe("unauthorized");
  });
});

describe("GET/POST /api/cron/inbox", () => {
  it("returns 503 when CRON_SECRET is unset and never runs the dispatcher", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(req(`Bearer ${SECRET}`))).status).toBe(503);
    expect(dispatch).not.toHaveBeenCalled();
  });
  it("returns 401 on a wrong secret", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    expect((await GET(req("Bearer nope"))).status).toBe(401);
    expect((await POST(req(undefined, "POST"))).status).toBe(401);
    expect(dispatch).not.toHaveBeenCalled();
  });
  it("runs one bounded pass and returns counts only", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    dispatch.mockResolvedValue({
      workspaces: 2,
      processed: 2,
      enqueued: 0,
      yielded: 0,
      errors: 0,
      stoppedBy: "idle",
      durationMs: 5,
    });
    const response = await POST(req(`Bearer ${SECRET}`, "POST"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      processed: 2,
      stoppedBy: "idle",
    });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
  it("hides dispatcher errors", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    dispatch.mockRejectedValue(new Error("DATABASE_URL=postgres://secret"));
    const response = await GET(req(`Bearer ${SECRET}`));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret");
  });
});
