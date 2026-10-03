import { describe, expect, it, vi } from "vitest";
import { databaseHealth, healthChecks, healthStatus, resetHealthCache } from "./health";
import { buildEvent, logLine, parseDsn, reportError, scrubEvent, scrubText, type SentryEvent } from "./observability";
import { contentSecurityPolicy, securityHeaders } from "./security-headers";
import { guardCron } from "./cron-guard";
import type { SharedLimiter } from "./limits";

describe("scrubText", () => {
  it("removes emails, tokens, keys, JWTs, phones and URL queries", () => {
    const raw =
      "Failed for claire.martin@client.fr (ＡＢ＠evil.test) token=abc123def456 Bearer sk_live_51Habcdefghijklmnop " +
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U " +
      "call 06 12 34 56 78 https://app.orbis.test/api/auth/callback?code=secretcode123 whsec_abcdefghijklmn";
    const out = scrubText(raw);
    for (const leak of ["claire", "evil.test", "abc123def456", "sk_live", "eyJ", "06 12", "secretcode123", "whsec_"])
      expect(out).not.toContain(leak);
    expect(out).toContain("https://app.orbis.test/api/auth/callback?[scrubbed]");
  });
  it("truncates", () => {
    expect(scrubText("x y ".repeat(2000), 100)).toHaveLength(100);
  });
});

describe("scrubEvent (beforeSend)", () => {
  it("rebuilds the event from an allowlist: no request, user, extra, breadcrumbs", () => {
    const event = {
      ...buildEvent(new Error("draft for bob@client.test failed"), { route: "/api/v1/inbox", method: "POST" }),
      request: { data: "Bonjour, voici mon devis", headers: { cookie: "sb-access-token=x" } },
      user: { email: "owner@acme.test" },
      extra: { body: "mail body" },
      breadcrumbs: [{ message: "x@y.test" }],
      tags: { route: "/api/v1/inbox", method: "POST", email: "owner@acme.test" },
    } as SentryEvent;
    const clean = scrubEvent(event);
    const json = JSON.stringify(clean);
    expect(json).not.toMatch(/bob@client|owner@acme|devis|cookie|mail body|x@y/);
    expect(clean.tags).toEqual({ route: "/api/v1/inbox", method: "POST" });
    expect(clean.exception?.values[0].value).toBe("draft for [email] failed");
  });
});

describe("reportError", () => {
  it("does nothing without a DSN", async () => {
    const fetcher = vi.fn();
    expect(await reportError(new Error("x"), {}, { fetch: fetcher as never, env: {} })).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("posts a scrubbed envelope to the DSN host", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { status: 200 }));
    const env = { SENTRY_DSN: "https://pubkey@o1.ingest.de.sentry.io/42", NODE_ENV: "production" };
    expect(await reportError(new Error("leak a@b.test"), { route: "/x" }, { fetch: fetcher as never, env })).toBe(true);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://o1.ingest.de.sentry.io/api/42/envelope/");
    expect(String(init.body)).not.toContain("a@b.test");
    expect((init.headers as Record<string, string>)["X-Sentry-Auth"]).toContain("sentry_key=pubkey");
  });
  it("never throws when the transport fails", async () => {
    const env = { SENTRY_DSN: "https://k@sentry.example/1" };
    expect(await reportError(new Error("x"), {}, { fetch: (async () => Promise.reject(new Error("net"))) as never, env })).toBe(false);
  });
  it("parses only https DSNs with a numeric project", () => {
    expect(parseDsn("http://k@h/1")).toBeNull();
    expect(parseDsn("https://h/1")).toBeNull();
    expect(parseDsn("https://k@h/abc")).toBeNull();
    expect(parseDsn("https://k@h/7")?.projectId).toBe("7");
  });
});

describe("logLine", () => {
  it("keeps numbers, booleans and identifier-like strings only", () => {
    const line = JSON.parse(
      logLine("info", "inbox_batch", { drafted: 3, ok: true, status: "completed", subject: "Devis cuisine", from: "a@b.test", "bad key": 1 }),
    );
    expect(line).toMatchObject({ level: "info", event: "inbox_batch", drafted: 3, ok: true, status: "completed" });
    expect(line.subject).toBeUndefined();
    expect(line.from).toBeUndefined();
  });
});

describe("security headers", () => {
  it("production: CSP, HSTS, frame-ancestors none, referrer policy", () => {
    const headers = Object.fromEntries(
      securityHeaders({ NODE_ENV: "production", VERCEL: "1", NEXT_PUBLIC_SUPABASE_URL: "https://proj.supabase.co" }).map((h) => [h.key, h.value]),
    );
    expect(headers["Strict-Transport-Security"]).toMatch(/max-age=63072000/);
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    const csp = headers["Content-Security-Policy"];
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("https://proj.supabase.co");
    expect(csp).toContain("wss://proj.supabase.co");
    expect(csp).toContain("https://js.stripe.com");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).not.toContain("unsafe-eval");
  });
  it("local http: no HSTS, no upgrade; dev allows eval for React tooling", () => {
    const local = securityHeaders({ NODE_ENV: "production" });
    expect(local.find((h) => h.key === "Strict-Transport-Security")).toBeUndefined();
    expect(contentSecurityPolicy({ NODE_ENV: "production" })).not.toContain("upgrade-insecure-requests");
    expect(contentSecurityPolicy({ NODE_ENV: "development" })).toContain("'unsafe-eval'");
  });
});

describe("health", () => {
  it("public status only degrades when a configured database is unreachable", async () => {
    resetHealthCache();
    vi.stubEnv("DATABASE_URL", "postgres://x");
    expect(await databaseHealth(1000, async () => Promise.reject(new Error("down")))).toBe("unavailable");
    // Cached for 10 s per instance.
    expect(await databaseHealth(5000, async () => undefined)).toBe("unavailable");
    expect(await databaseHealth(20_000, async () => undefined)).toBe("ok");
    vi.unstubAllEnvs();
    const checks = await healthChecks({ database: async () => "not_configured" });
    expect(healthStatus(checks)).toBe("ok");
    expect(JSON.stringify(checks)).not.toMatch(/sk_|postgres:|https?:/);
  });
});

describe("guardCron", () => {
  const allow: SharedLimiter = { take: async () => ({ allowed: true, retryAfterMs: 0, layer: "memory" }) };
  const deny: SharedLimiter = { take: async () => ({ allowed: false, retryAfterMs: 1, layer: "shared" }) };
  const secret = "s".repeat(40);
  it("authorized callers are never limited; failures are counted and limited", async () => {
    vi.stubEnv("CRON_SECRET", secret);
    expect(await guardCron(new Request("https://x/api/cron/inbox", { headers: { authorization: `Bearer ${secret}` } }), deny)).toBeNull();
    expect((await guardCron(new Request("https://x/api/cron/inbox"), allow))?.status).toBe(401);
    expect((await guardCron(new Request("https://x/api/cron/inbox"), deny))?.status).toBe(429);
    vi.stubEnv("CRON_SECRET", "short");
    expect((await guardCron(new Request("https://x/api/cron/inbox"), allow))?.status).toBe(503);
    vi.unstubAllEnvs();
  });
});
