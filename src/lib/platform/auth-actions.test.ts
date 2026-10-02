import { describe, expect, it, vi } from "vitest";
import { authOptions, safeReturnTo, TERMS_VERSION } from "./auth";
import { MESSAGES, runAuthAction, type AuthActionDeps, type SupabaseAuthSurface } from "./auth-actions";
import type { SharedLimiter } from "./limits";

const allow: SharedLimiter = { take: async () => ({ allowed: true, retryAfterMs: 0, layer: "memory" }) };
const deny: SharedLimiter = { take: async () => ({ allowed: false, retryAfterMs: 1000, layer: "shared" }) };

function auth(overrides: Partial<SupabaseAuthSurface> = {}): SupabaseAuthSurface {
  return {
    signInWithPassword: vi.fn(async () => ({ error: null })),
    signUp: vi.fn(async () => ({ data: { session: null }, error: null })),
    signInWithOtp: vi.fn(async () => ({ error: null })),
    signInWithOAuth: vi.fn(async () => ({ data: { url: "https://proj.supabase.co/auth/v1/authorize?provider=google" }, error: null })),
    ...overrides,
  };
}
function deps(over: Partial<AuthActionDeps> = {}) {
  const cookies: Record<string, string> = {};
  const d: AuthActionDeps & { cookies: Record<string, string> } = {
    auth: auth(),
    origin: "https://app.orbis.test",
    clientKey: "203.0.113.1",
    ipLimiter: allow,
    emailLimiter: allow,
    otpLimiter: allow,
    options: { password: true, magicLink: true, google: true, microsoft: true },
    providerOrigin: "https://proj.supabase.co",
    setCookie: (n, v) => {
      cookies[n] = v;
    },
    cookies,
    ...over,
  };
  return d;
}

describe("safeReturnTo", () => {
  it("keeps only relative paths under allowlisted app routes", () => {
    for (const bad of [
      "https://evil.test",
      "//evil.test",
      "/\\evil.test",
      "/api/v1/account/delete",
      "/login",
      "/\n/evil.test",
      "/%0d%0aSet-Cookie:x",
      "/unknown-route",
      "javascript:alert(1)",
      "/today\u0085",
      "",
      42,
    ])
      expect(safeReturnTo(bad)).toBe("/today");
    expect(safeReturnTo("/start")).toBe("/start");
    expect(safeReturnTo("/audit?website=https%3A%2F%2Fcompany.test")).toBe("/audit?website=https%3A%2F%2Fcompany.test");
    expect(safeReturnTo("/legal/cgu")).toBe("/legal/cgu");
  });
});

describe("authOptions", () => {
  it("shows OAuth buttons only when explicitly enabled", () => {
    expect(authOptions({})).toEqual({ password: true, magicLink: true, google: false, microsoft: false });
    expect(authOptions({ ORBIS_AUTH_GOOGLE: "true", ORBIS_AUTH_MAGIC_LINK: "false" })).toMatchObject({ google: true, magicLink: false, microsoft: false });
  });
});

describe("runAuthAction", () => {
  it("rate limits per IP before anything else", async () => {
    const d = deps({ ipLimiter: deny });
    expect(await runAuthAction("sign-in", { email: "a@b.test", password: "x" }, d)).toEqual({ status: 429, body: { error: MESSAGES.limited } });
    expect(d.auth.signInWithPassword).not.toHaveBeenCalled();
  });
  it("rate limits per address (brute force)", async () => {
    const d = deps({ emailLimiter: deny });
    expect((await runAuthAction("sign-in", { email: "a@b.test", password: "x" }, d)).status).toBe(429);
  });
  it("sign-in failures are generic (no enumeration)", async () => {
    const d = deps({ auth: auth({ signInWithPassword: async () => ({ error: { status: 400 } }) }) });
    expect(await runAuthAction("sign-in", { email: "a@b.test", password: "wrong" }, d)).toEqual({ status: 401, body: { error: MESSAGES.signIn } });
  });
  it("sign-in returns a safe redirect only", async () => {
    const r = await runAuthAction("sign-in", { email: "a@b.test", password: "x", returnTo: "https://evil.test" }, deps());
    expect(r).toEqual({ status: 200, body: { ok: true, redirectTo: "/today" } });
  });
  it("sign-up requires CGU acceptance and records its version", async () => {
    const d = deps();
    expect(await runAuthAction("sign-up", { email: "a@b.test", password: "123456789012" }, d)).toEqual({ status: 400, body: { error: MESSAGES.terms } });
    const r = await runAuthAction("sign-up", { email: "a@b.test", password: "123456789012", acceptTerms: true, returnTo: "/start" }, d);
    expect(r.body).toMatchObject({ ok: true, confirmationRequired: true, redirectTo: "/start" });
    const call = vi.mocked(d.auth.signUp).mock.calls[0][0];
    expect(call.options.data.terms_version).toBe(TERMS_VERSION);
    expect(call.options.emailRedirectTo).toBe("https://app.orbis.test/api/auth/callback");
    expect(d.cookies.orbis_auth_return_to).toBe("/start");
  });
  it("sign-up rejects short passwords", async () => {
    expect((await runAuthAction("sign-up", { email: "a@b.test", password: "short", acceptTerms: true }, deps())).status).toBe(400);
  });
  it("magic link answers identically for known, unknown and refused addresses", async () => {
    const known = await runAuthAction("magic-link", { email: "known@b.test" }, deps());
    const refused = await runAuthAction(
      "magic-link",
      { email: "unknown@b.test" },
      deps({ auth: auth({ signInWithOtp: async () => ({ error: { status: 422 } }) }) }),
    );
    expect(known).toEqual(refused);
    expect(known.body).toMatchObject({ ok: true, sent: true, message: MESSAGES.sent });
  });
  it("magic link sign-in never creates an account; sign-up needs CGU", async () => {
    const d = deps();
    await runAuthAction("magic-link", { email: "a@b.test", intent: "sign-in" }, d);
    expect(vi.mocked(d.auth.signInWithOtp).mock.calls[0][0].options.shouldCreateUser).toBe(false);
    expect((await runAuthAction("magic-link", { email: "a@b.test", intent: "sign-up" }, d)).status).toBe(400);
    await runAuthAction("magic-link", { email: "a@b.test", intent: "sign-up", acceptTerms: true }, d);
    const last = vi.mocked(d.auth.signInWithOtp).mock.calls.at(-1)![0];
    expect(last.options).toMatchObject({ shouldCreateUser: true, data: { terms_version: TERMS_VERSION } });
  });
  it("magic link has its own per-address send limit", async () => {
    expect((await runAuthAction("magic-link", { email: "a@b.test" }, deps({ otpLimiter: deny }))).status).toBe(429);
  });
  it("magic link refused when disabled", async () => {
    const d = deps({ options: { password: true, magicLink: false, google: false, microsoft: false } });
    expect((await runAuthAction("magic-link", { email: "a@b.test" }, d)).status).toBe(404);
  });
  it("OAuth only for enabled providers, with a provider-hosted https URL", async () => {
    const off = deps({ options: { password: true, magicLink: true, google: false, microsoft: false } });
    expect((await runAuthAction("oauth", { provider: "google" }, off)).status).toBe(404);
    const d = deps();
    const r = await runAuthAction("oauth", { provider: "microsoft", returnTo: "/start" }, d);
    expect(r.body.url).toMatch(/^https:\/\/proj\.supabase\.co\//);
    expect(vi.mocked(d.auth.signInWithOAuth).mock.calls[0][0]).toMatchObject({ provider: "azure", options: { skipBrowserRedirect: true } });
    const evil = deps({ auth: auth({ signInWithOAuth: async () => ({ data: { url: "https://evil.test/authorize" }, error: null }) }) });
    expect((await runAuthAction("oauth", { provider: "google" }, evil)).status).toBe(503);
  });
  it("OAuth sign-up records pending CGU acceptance", async () => {
    const d = deps();
    expect((await runAuthAction("oauth", { provider: "google", intent: "sign-up" }, d)).status).toBe(400);
    await runAuthAction("oauth", { provider: "google", intent: "sign-up", acceptTerms: true }, d);
    expect(d.cookies.orbis_terms_pending).toBe(TERMS_VERSION);
  });
  it("unknown actions are 404", async () => {
    expect((await runAuthAction("reset-everything", {}, deps())).status).toBe(404);
  });
});
