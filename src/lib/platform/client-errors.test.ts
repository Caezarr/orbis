import { beforeEach, describe, expect, it, vi } from "vitest";
import { installBrowserErrorReporting, MAX_REPORTS_PER_PAGE, toReport } from "./browser-errors";
import { browserReportSchema, buildBrowserEvent, parseBrowserStack, routeTemplate } from "./client-errors";
import { scrubEvent } from "./observability";

const CHROME_STACK = [
  "TypeError: Cannot read properties of undefined (reading 'drafts')",
  "    at InboxList (https://app.orbis.test/_next/static/chunks/app/inbox-3f2a.js?v=1:1:2045)",
  "    at https://app.orbis.test/_next/static/chunks/framework-9a.js:2:300",
].join("\n");
const FIREFOX_STACK = "InboxList@https://app.orbis.test/_next/static/chunks/app/inbox-3f2a.js:1:2045\n@https://app.orbis.test/_next/static/chunks/main.js:5:10";

describe("routeTemplate", () => {
  it("keeps slugs and route groups, replaces id-like segments, drops query and hash", () => {
    expect(routeTemplate("/start?company=acme#step2")).toBe("/start");
    expect(routeTemplate("/workspace/7f3c2a1e-9b0d-4c1e-a2b3-0123456789ab/inbox")).toBe("/workspace/[id]/inbox");
    expect(routeTemplate("/missions/42/claire.martin@client.fr")).toBe("/missions/[id]/[id]");
    expect(routeTemplate("/")).toBe("/");
    expect(routeTemplate("/a/b/c/d/e/f/g").split("/").length).toBe(6);
  });
});

describe("parseBrowserStack", () => {
  it("parses V8 and Gecko frames, oldest first, path only", () => {
    const chrome = parseBrowserStack(CHROME_STACK);
    expect(chrome).toEqual([
      { function: "?", filename: "/_next/static/chunks/framework-9a.js", lineno: 2, colno: 300 },
      { function: "InboxList", filename: "/_next/static/chunks/app/inbox-3f2a.js", lineno: 1, colno: 2045 },
    ]);
    const firefox = parseBrowserStack(FIREFOX_STACK);
    expect(firefox.at(-1)).toEqual({ function: "InboxList", filename: "/_next/static/chunks/app/inbox-3f2a.js", lineno: 1, colno: 2045 });
    expect(parseBrowserStack(undefined)).toEqual([]);
  });
});

describe("browser event", () => {
  it("is scrubbed: no email, token, query string or page content survives", () => {
    const report = browserReportSchema.parse({
      source: "error",
      type: "Error",
      message: "draft for bob@client.test failed token=abc123secret",
      stack: "Error\n    at x (https://app.orbis.test/_next/static/chunks/a.js?token=eyJsecret:1:2)",
      path: "/workspace/7f3c2a1e9b0d/inbox",
    });
    const clean = scrubEvent(buildBrowserEvent(report, { NODE_ENV: "production" }));
    const json = JSON.stringify(clean);
    expect(json).not.toMatch(/bob@client|abc123secret|eyJsecret|7f3c2a1e9b0d/);
    expect(clean.platform).toBe("javascript");
    expect(clean.tags).toEqual({ route: "/workspace/[id]/inbox", runtime: "browser", source: "error" });
  });
  it("rejects unknown fields and oversized values", () => {
    const base = { source: "error", type: "Error", message: "x", path: "/" };
    expect(browserReportSchema.safeParse({ ...base, cookie: "sb=1" }).success).toBe(false);
    expect(browserReportSchema.safeParse({ ...base, message: "x".repeat(501) }).success).toBe(false);
    expect(browserReportSchema.safeParse({ ...base, source: "console" }).success).toBe(false);
  });
});

describe("toReport", () => {
  it("ignores extension errors, opaque script errors and empty values", () => {
    expect(toReport("error", null, { message: "Script error." }, "/")).toBeNull();
    expect(toReport("error", new Error("boom"), { filename: "chrome-extension://abc/content.js" }, "/")).toBeNull();
    expect(toReport("error", new Error("ResizeObserver loop limit exceeded"), {}, "/")).toBeNull();
    expect(toReport("unhandledrejection", undefined, {}, "/")).toBeNull();
  });
  it("keeps the path without query string and truncates", () => {
    const report = toReport("unhandledrejection", new Error("y".repeat(900)), {}, "/start?email=a@b.test");
    expect(report?.path).toBe("/start");
    expect(report?.message).toHaveLength(500);
    expect(report && browserReportSchema.safeParse(report).success).toBe(true);
  });
});

describe("installBrowserErrorReporting", () => {
  function fakeWindow() {
    const listeners: Record<string, (event: Event) => void> = {};
    return {
      listeners,
      target: {
        addEventListener: (type: string, fn: (event: Event) => void) => (listeners[type] = fn),
        location: { pathname: "/start" },
      } as never,
    };
  }
  it("sends errors and rejections, dedupes, caps per page, never throws", () => {
    const { listeners, target } = fakeWindow();
    const send = vi.fn();
    installBrowserErrorReporting(target, send);
    listeners.error({ error: new Error("a"), message: "a" } as never);
    listeners.error({ error: new Error("a"), message: "a" } as never);
    listeners.error({ message: "", error: null } as never); // resource load error
    listeners.unhandledrejection({ reason: new TypeError("b") } as never);
    expect(send).toHaveBeenCalledTimes(2);
    expect(JSON.parse(send.mock.calls[1][0])).toMatchObject({ source: "unhandledrejection", type: "TypeError", path: "/start" });
    for (let i = 0; i < 20; i++) listeners.error({ error: new Error(`e${i}`) } as never);
    expect(send).toHaveBeenCalledTimes(MAX_REPORTS_PER_PAGE);
    const throwing = fakeWindow();
    installBrowserErrorReporting(throwing.target, () => {
      throw new Error("offline");
    });
    expect(() => throwing.listeners.error({ error: new Error("z") } as never)).not.toThrow();
  });
});

const afterTasks: (() => unknown)[] = [];
vi.mock("next/server", () => ({ after: (fn: () => unknown) => afterTasks.push(fn) }));
const take = vi.fn(async () => ({ allowed: true, retryAfterMs: 0, layer: "memory" as const }));
vi.mock("@/lib/platform/limits", () => ({ createSharedLimiter: () => ({ take }) }));

describe("POST /api/client-errors", () => {
  const ORIGIN = "https://app.orbis.test";
  const body = JSON.stringify({ source: "error", type: "Error", message: "boom a@b.test", path: "/start" });
  const post = (init: { body?: string; origin?: string | null } = {}) =>
    new Request(`${ORIGIN}/api/client-errors`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(init.origin === null ? {} : { Origin: init.origin ?? ORIGIN }) },
      body: init.body ?? body,
    });
  beforeEach(() => {
    afterTasks.length = 0;
    take.mockClear();
    vi.unstubAllEnvs();
    vi.stubEnv("APP_ORIGIN", ORIGIN);
    vi.stubEnv("SENTRY_DSN", "https://pubkey@o1.ingest.de.sentry.io/42");
  });

  it("refuses cross-origin and missing Origin", async () => {
    const { POST } = await import("@/app/api/client-errors/route");
    expect((await POST(post({ origin: "https://evil.test" }))).status).toBe(403);
    expect((await POST(post({ origin: null }))).status).toBe(403);
  });
  it("drops silently without SENTRY_DSN, no limiter or transport call", async () => {
    vi.stubEnv("SENTRY_DSN", "");
    const { POST } = await import("@/app/api/client-errors/route");
    expect((await POST(post())).status).toBe(204);
    expect(take).not.toHaveBeenCalled();
    expect(afterTasks).toHaveLength(0);
  });
  it("rejects invalid and oversized bodies", async () => {
    const { POST } = await import("@/app/api/client-errors/route");
    expect((await POST(post({ body: "not json" }))).status).toBe(400);
    expect((await POST(post({ body: JSON.stringify({ message: "x".repeat(9000) }) }))).status).toBe(413);
    expect(afterTasks).toHaveLength(0);
  });
  it("rate limits per client", async () => {
    take.mockResolvedValueOnce({ allowed: false, retryAfterMs: 30_000, layer: "memory" });
    const { POST } = await import("@/app/api/client-errors/route");
    const response = await POST(post());
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("30");
  });
  it("forwards a scrubbed event after the response", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const { POST } = await import("@/app/api/client-errors/route");
    expect((await POST(post())).status).toBe(204);
    expect(afterTasks).toHaveLength(1);
    await afterTasks[0]();
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://o1.ingest.de.sentry.io/api/42/envelope/");
    expect(String(init.body)).not.toContain("a@b.test");
    expect(String(init.body)).toContain('"runtime":"browser"');
    vi.unstubAllGlobals();
  });
});
