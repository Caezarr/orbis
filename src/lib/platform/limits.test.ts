import { describe, expect, it, vi } from "vitest";
import { createSharedDailyBudget, createSharedLimiter, hashLimitKey, type SharedLimitStore } from "./limits";

function fakeStore(overrides: Partial<SharedLimitStore> = {}) {
  const counts = new Map<string, number>();
  const store: SharedLimitStore & { calls: unknown[] } = {
    calls: [],
    async take(input) {
      store.calls.push(input);
      const key = `${input.bucket}:${input.keyHash}`;
      const used = counts.get(key) ?? 0;
      if (used + input.cost > input.limit) return { allowed: false, used, retryAfterMs: 5000 };
      counts.set(key, used + input.cost);
      return { allowed: true, used: used + input.cost, retryAfterMs: 0 };
    },
    async reserve(input) {
      store.calls.push(input);
      const g = counts.get(`${input.bucket}:*`) ?? 0;
      const k = counts.get(`${input.bucket}:${input.keyHash}`) ?? 0;
      if (g + input.cost > input.globalCap) return "global";
      if (k + input.cost > input.keyCap) return "key";
      counts.set(`${input.bucket}:*`, g + input.cost);
      counts.set(`${input.bucket}:${input.keyHash}`, k + input.cost);
      return "ok";
    },
    ...overrides,
  };
  return store;
}

describe("hashLimitKey", () => {
  it("never returns the raw key and is stable per bucket", () => {
    const h = hashLimitKey("auth_ip", "203.0.113.7");
    expect(h).toMatch(/^[a-f0-9]{64}$/);
    expect(h).not.toContain("203");
    expect(hashLimitKey("auth_ip", "203.0.113.7")).toBe(h);
    expect(hashLimitKey("start_site", "203.0.113.7")).not.toBe(h);
    // Emails are case/space-normalized before hashing.
    expect(hashLimitKey("auth_email", " A@B.test ")).toBe(hashLimitKey("auth_email", "a@b.test"));
  });
  it("uses an HMAC when ORBIS_RATE_LIMIT_SECRET is set", () => {
    const plain = hashLimitKey("b", "k");
    vi.stubEnv("ORBIS_RATE_LIMIT_SECRET", "s3cret");
    expect(hashLimitKey("b", "k")).not.toBe(plain);
    vi.unstubAllEnvs();
  });
});

describe("createSharedLimiter", () => {
  it("is shared across instances: two limiters (two serverless instances) share one counter", async () => {
    const store = fakeStore();
    const a = createSharedLimiter({ bucket: "start_site", limit: 3, windowMs: 60_000 }, { store, enabled: () => true });
    const b = createSharedLimiter({ bucket: "start_site", limit: 3, windowMs: 60_000 }, { store, enabled: () => true });
    expect((await a.take("ip")).allowed).toBe(true);
    expect((await b.take("ip")).allowed).toBe(true);
    expect((await a.take("ip")).allowed).toBe(true);
    const denied = await b.take("ip");
    expect(denied).toMatchObject({ allowed: false, layer: "shared", retryAfterMs: 5000 });
    expect(store.calls.every((c) => /^[a-f0-9]{64}$/.test((c as { keyHash: string }).keyHash))).toBe(true);
  });
  it("memory pre-check refuses without touching the database", async () => {
    const store = fakeStore();
    const take = vi.spyOn(store, "take");
    const l = createSharedLimiter({ bucket: "x", limit: 1, windowMs: 60_000 }, { store, enabled: () => true });
    await l.take("ip");
    expect(await l.take("ip")).toMatchObject({ allowed: false, layer: "memory" });
    expect(take).toHaveBeenCalledTimes(1);
  });
  it("fails open (memory still applies) or closed when the shared store is down", async () => {
    const down = fakeStore({ take: async () => Promise.reject(new Error("db down")) });
    const open = createSharedLimiter({ bucket: "x", limit: 5, windowMs: 60_000 }, { store: down, enabled: () => true });
    expect(await open.take("ip")).toMatchObject({ allowed: true, layer: "degraded" });
    const closed = createSharedLimiter({ bucket: "x", limit: 5, windowMs: 60_000, failMode: "closed" }, { store: down, enabled: () => true });
    expect(await closed.take("ip")).toMatchObject({ allowed: false, layer: "degraded" });
  });
  it("uses memory only when shared limits are disabled", async () => {
    const store = fakeStore();
    const l = createSharedLimiter({ bucket: "x", limit: 2, windowMs: 60_000 }, { store, enabled: () => false });
    expect(await l.take("ip")).toMatchObject({ allowed: true, layer: "memory" });
    expect(store.calls).toHaveLength(0);
  });
  it("rejects invalid bucket names", () => {
    expect(() => createSharedLimiter({ bucket: "Bad Bucket!", limit: 1, windowMs: 1000 })).toThrow();
  });
});

describe("createSharedDailyBudget", () => {
  it("enforces global and per-key caps across instances and fails closed", async () => {
    const store = fakeStore();
    const opts = { bucket: "start_preview_budget", capCents: 40, perKeyCapCents: 30 };
    const a = createSharedDailyBudget(opts, { store, enabled: () => true });
    const b = createSharedDailyBudget(opts, { store, enabled: () => true });
    expect(await a.reserve("ip1", 15)).toEqual({ allowed: true });
    expect(await b.reserve("ip1", 15)).toEqual({ allowed: true });
    expect(await b.reserve("ip1", 15)).toEqual({ allowed: false, scope: "global" });
    const down = createSharedDailyBudget(opts, { store: fakeStore({ reserve: async () => Promise.reject(new Error("x")) }), enabled: () => true });
    expect(await down.reserve("ip2", 15)).toEqual({ allowed: false, scope: "unavailable" });
  });
  it("per-key cap", async () => {
    const store = fakeStore();
    const budget = createSharedDailyBudget({ bucket: "b", capCents: 1000, perKeyCapCents: 20 }, { store, enabled: () => true });
    expect((await budget.reserve("ip", 15)).allowed).toBe(true);
    // Memory pre-check already refuses the second one for the same instance.
    expect(await budget.reserve("ip", 15)).toEqual({ allowed: false, scope: "key" });
  });
});
