import { beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.fn();
const verifyOtp = vi.fn();
const updateUser = vi.fn();
const jar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { value: jar.get(name) } : undefined),
    delete: (name: string) => jar.delete(name),
  }),
}));
vi.mock("@/lib/platform/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/platform/auth")>()),
  authClient: async () => ({ auth: { exchangeCodeForSession, verifyOtp, updateUser } }),
}));

const { GET } = await import("./route");
const call = (query: string) => GET(new Request(`https://app.test/api/auth/callback${query}`));

describe("auth callback", () => {
  beforeEach(() => {
    vi.stubEnv("APP_ORIGIN", "https://app.test");
    jar.clear();
    exchangeCodeForSession.mockReset().mockResolvedValue({ error: null });
    verifyOtp.mockReset().mockResolvedValue({ error: null });
  });

  it("exchanges a PKCE code and goes to the return-to cookie", async () => {
    jar.set("orbis_auth_return_to", "/start");
    const res = await call("?code=abc");
    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(res.headers.get("location")).toBe("https://app.test/start");
    expect(jar.has("orbis_auth_return_to")).toBe(false);
  });

  it("refuses a token_hash link: it would verify in any browser (login CSRF)", async () => {
    for (const type of ["magiclink", "email", "signup"]) {
      const res = await call(`?token_hash=attacker-token&type=${type}`);
      expect(res.headers.get("location")).toBe("https://app.test/login?error=confirmation");
    }
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("sends a failed exchange back to the login page", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: new Error("no verifier") });
    const res = await call("?code=abc");
    expect(res.headers.get("location")).toBe("https://app.test/login?error=confirmation");
  });
});
