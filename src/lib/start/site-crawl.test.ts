import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { crawlSite, parseRobots, pickPages, robotsAllows, sitemapLocs, type Fetcher } from "./site-crawl";

const html = (name: string) => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8");
const ORIGIN = "https://www.martin-plomberie.fr";

type Route = { body: string; type?: string; delayMs?: number; redirect?: string; status?: number };
function fakeFetcher(routes: Record<string, Route>) {
  const calls: string[] = [];
  let active = 0;
  let maxActive = 0;
  const fetcher: Fetcher = async (url, { signal, accept = ["text/html"] }) => {
    calls.push(url);
    active++;
    maxActive = Math.max(maxActive, active);
    try {
      const route = routes[url];
      if (route?.delayMs)
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, route.delayMs);
          signal.addEventListener("abort", () => {
            clearTimeout(t);
            reject(new Error("Délai dépassé."));
          });
        });
      if (!route || route.status) throw new Error("Ce site ne fournit pas de page HTML publique lisible.");
      const type = route.type ?? "text/html; charset=utf-8";
      if (!accept.some((a) => type.includes(a))) throw new Error("Ce site ne fournit pas de page HTML publique lisible.");
      return { url: route.redirect ?? url, contentType: type, body: route.body };
    } finally {
      active--;
    }
  };
  return { fetcher, calls, maxActive: () => maxActive };
}

const baseRoutes = (): Record<string, Route> => ({
  [`${ORIGIN}/`]: { body: html("plombier-home.html") },
  [`${ORIGIN}/robots.txt`]: { body: "User-agent: *\nDisallow: /espace-prive/\n", type: "text/plain" },
  [`${ORIGIN}/tarifs`]: { body: html("plombier-tarifs.html") },
  [`${ORIGIN}/mentions-legales`]: { body: html("plombier-mentions.html") },
  [`${ORIGIN}/contact`]: { body: "<html><body><h1>Contact</h1><p>Appelez-nous au 03 21 45 67 89.</p></body></html>" },
  [`${ORIGIN}/nos-prestations`]: { body: "<html><body><h1>Nos prestations</h1><h2>Plomberie</h2></body></html>" },
});

describe("crawlSite", () => {
  it("reads the home page plus same-site high-value pages, in rank order", async () => {
    const f = fakeFetcher(baseRoutes());
    const r = await crawlSite("www.martin-plomberie.fr", {}, f.fetcher);
    expect(r.pages.map((p) => p.url)).toEqual([
      `${ORIGIN}/`,
      `${ORIGIN}/contact`,
      `${ORIGIN}/nos-prestations`,
      `${ORIGIN}/tarifs`,
      `${ORIGIN}/mentions-legales`,
    ]);
    // Never: other sites, plain http, blog posts, private areas.
    expect(f.calls.some((c) => /autre-site|http:\/\/|blog|espace-prive/.test(c))).toBe(false);
    expect(r.website).toBe(`${ORIGIN}/`);
  });

  it("respects robots.txt for the pages it chooses", async () => {
    const routes = baseRoutes();
    routes[`${ORIGIN}/robots.txt`] = {
      body: "User-agent: *\nDisallow: /\n\nUser-agent: OrbisCompanyReader\nAllow: /contact\nDisallow: /tarifs\n",
      type: "text/plain",
    };
    const f = fakeFetcher(routes);
    const r = await crawlSite(`${ORIGIN}/`, {}, f.fetcher);
    expect(f.calls).not.toContain(`${ORIGIN}/tarifs`);
    expect(r.skipped).toContainEqual({ url: `${ORIGIN}/tarifs`, reason: "robots" });
    expect(r.pages.map((p) => p.url)).toContain(`${ORIGIN}/contact`);
  });

  it("stops at the time budget and keeps what it has", async () => {
    const routes = baseRoutes();
    for (const path of ["/tarifs", "/contact", "/nos-prestations", "/mentions-legales"]) routes[`${ORIGIN}${path}`].delayMs = 5_000;
    const f = fakeFetcher(routes);
    const started = Date.now();
    const r = await crawlSite(`${ORIGIN}/`, { budgetMs: 1_500, pageTimeoutMs: 5_000 }, f.fetcher);
    expect(Date.now() - started).toBeLessThan(3_000);
    expect(r.pages.map((p) => p.url)).toEqual([`${ORIGIN}/`]);
    expect(r.skipped.length).toBeGreaterThan(0);
  });

  it("limits concurrency and the number of pages", async () => {
    const routes = baseRoutes();
    for (const path of ["/tarifs", "/contact", "/nos-prestations", "/mentions-legales"]) routes[`${ORIGIN}${path}`].delayMs = 30;
    const f = fakeFetcher(routes);
    const r = await crawlSite(`${ORIGIN}/`, { concurrency: 2, maxPages: 3 }, f.fetcher);
    expect(f.maxActive()).toBeLessThanOrEqual(2);
    expect(r.pages).toHaveLength(4);
  });

  it("drops a page whose redirect leaves the site, and survives failing pages", async () => {
    const routes = baseRoutes();
    routes[`${ORIGIN}/contact`] = { body: "<p>ailleurs</p>", redirect: "https://evil.example.com/contact" };
    routes[`${ORIGIN}/tarifs`] = { body: "", status: 500 };
    const r = await crawlSite(`${ORIGIN}/`, {}, fakeFetcher(routes).fetcher);
    expect(r.pages.map((p) => p.url)).not.toContain("https://evil.example.com/contact");
    expect(r.pages.map((p) => p.url)).not.toContain(`${ORIGIN}/tarifs`);
    expect(r.pages.length).toBeGreaterThanOrEqual(3);
  });

  it("uses the sitemap when the home page links are not enough", async () => {
    const routes: Record<string, Route> = {
      [`${ORIGIN}/`]: { body: "<html><body><h1>Martin</h1><p>Plombier à Lens.</p></body></html>" },
      [`${ORIGIN}/robots.txt`]: { body: `Sitemap: ${ORIGIN}/sitemap.xml\n`, type: "text/plain" },
      [`${ORIGIN}/sitemap.xml`]: {
        body: `<urlset><url><loc>${ORIGIN}/</loc></url><url><loc>${ORIGIN}/tarifs</loc></url><url><loc>https://cdn.other.net/tarifs</loc></url></urlset>`,
        type: "application/xml",
      },
      [`${ORIGIN}/tarifs`]: { body: html("plombier-tarifs.html") },
    };
    const r = await crawlSite(`${ORIGIN}/`, {}, fakeFetcher(routes).fetcher);
    expect(r.pages.map((p) => p.url)).toEqual([`${ORIGIN}/`, `${ORIGIN}/tarifs`]);
  });

  it("refuses non-HTTPS, credentials and local hosts before any request", async () => {
    const f = fakeFetcher(baseRoutes());
    for (const bad of ["http://www.martin-plomberie.fr", "https://user:pw@martin-plomberie.fr", "https://localhost/", "https://intranet.local/"])
      await expect(crawlSite(bad, {}, f.fetcher)).rejects.toThrow();
    expect(f.calls).toHaveLength(0);
  });

  it("propagates an unreadable home page", async () => {
    await expect(crawlSite(`${ORIGIN}/`, {}, fakeFetcher({}).fetcher)).rejects.toThrow();
  });
});

describe("robots, links and sitemap parsing", () => {
  it("applies the longest matching rule, Allow winning ties, with wildcards", () => {
    const { rules, sitemaps } = parseRobots(
      "# comment\nUser-agent: *\nDisallow: /private\nAllow: /private/ok\nDisallow: /*.pdf$\nSitemap: https://x.fr/s.xml",
    );
    expect(robotsAllows(rules, "/private/x")).toBe(false);
    expect(robotsAllows(rules, "/private/ok/page")).toBe(true);
    expect(robotsAllows(rules, "/doc.pdf")).toBe(false);
    expect(robotsAllows(rules, "/doc.pdf?x")).toBe(true);
    expect(robotsAllows(rules, "/contact")).toBe(true);
    expect(sitemaps).toEqual(["https://x.fr/s.xml"]);
    expect(robotsAllows(parseRobots("User-agent: *\nDisallow:\n").rules, "/a")).toBe(true);
  });
  it("picks one page per kind, shallow first, same site only", () => {
    const home = new URL("https://www.x.fr/");
    const picked = pickPages(
      home,
      [
        { href: "https://x.fr/contact", text: "Contact" },
        { href: "https://www.x.fr/a/b/c/contact-us", text: "Contact" },
        { href: "https://www.x.fr/plan.pdf", text: "Tarifs" },
        { href: "https://www.x.fr/qui-sommes-nous", text: "À propos" },
        { href: "https://autre.fr/tarifs", text: "Tarifs" },
        { href: "https://www.x.fr/#services", text: "Services" },
      ],
      6,
    );
    expect(picked).toEqual(["https://x.fr/contact", "https://www.x.fr/qui-sommes-nous"]);
  });
  it("reads sitemap locs and detects an index", () => {
    expect(sitemapLocs("<sitemapindex><sitemap><loc>https://x.fr/page-sitemap.xml</loc></sitemap></sitemapindex>")).toEqual({
      index: true,
      locs: ["https://x.fr/page-sitemap.xml"],
    });
  });
});

describe("SSRF guard of the shared fetcher", () => {
  afterEach(() => {
    vi.doUnmock("node:dns/promises");
    vi.resetModules();
  });
  it("refuses a public-looking host resolving to a private address, without connecting", async () => {
    vi.resetModules();
    vi.doMock("node:dns/promises", () => ({ lookup: async () => [{ address: "10.0.0.5", family: 4 }] }));
    const { fetchPublicResource } = await import("@/lib/runtime/company-site");
    await expect(fetchPublicResource("https://rebind.example.fr/", { signal: AbortSignal.timeout(2000) })).rejects.toThrow(
      /privées ou réservées/,
    );
  });
  it("refuses loopback and link-local (cloud metadata) addresses", async () => {
    const { publicAddress } = await import("@/lib/runtime/company-site");
    for (const ip of ["127.0.0.1", "169.254.169.254", "::1", "192.168.1.10", "fd00::1"]) expect(publicAddress(ip)).toBe(false);
    expect(publicAddress("93.184.216.34")).toBe(true);
  });
});
