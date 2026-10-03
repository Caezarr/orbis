import { fetchPublicResource, publicWebsite, type PublicResource } from "@/lib/runtime/company-site";
import { parseSitePage, type SitePage } from "./site-page";

/*
 * Bounded crawl for /start step 1 (anonymous): the home page plus up to
 * `maxPages` high-value pages of the SAME site (contact, services, prices,
 * about, zone, FAQ, legal notice, references) found in its links or sitemap.
 *
 * - Every request goes through fetchPublicResource: read-only broker decision,
 *   HTTPS only, SSRF guard on every hop (private/reserved IPs refused, IP pinned).
 * - robots.txt is read once and respected for every page Orbi chooses to open
 *   (the home page is the address the owner typed, read once like a browser).
 * - Hard limits: total time budget, per-page timeout, concurrency, per-page and
 *   total bytes, link and sitemap caps. When the budget is spent, Orbi stops and
 *   uses what it has.
 * - Nothing is stored: pages live in memory for the request only.
 */

export type CrawlOptions = {
  /** Whole crawl, home included. */
  budgetMs?: number;
  homeTimeoutMs?: number;
  pageTimeoutMs?: number;
  maxPages?: number;
  concurrency?: number;
  maxPageBytes?: number;
  maxTotalBytes?: number;
};
export type Fetcher = (
  url: string,
  options: { signal: AbortSignal; accept?: string[]; maxBytes?: number },
) => Promise<PublicResource>;
export type CrawlResult = {
  pages: SitePage[];
  website: string;
  readMs: number;
  /** Pages considered but not read, with the reason (for tests and diagnostics). */
  skipped: { url: string; reason: "robots" | "budget" | "error" | "not_html" | "bytes" }[];
  instructionsRemoved: number;
};

export const CRAWL_DEFAULTS: Required<CrawlOptions> = {
  budgetMs: 20_000,
  homeTimeoutMs: 12_000,
  pageTimeoutMs: 7_000,
  maxPages: 6,
  concurrency: 3,
  maxPageBytes: 800_000,
  maxTotalBytes: 3_000_000,
};

// ------------------------------------------------------------------ robots.txt

type Rule = { allow: boolean; pattern: string };
/** Rules of the group that applies to Orbi's user agent (or "*"). */
export function parseRobots(text: string, agent = "orbiscompanyreader") {
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  const sitemaps: string[] = [];
  let current: { agents: string[]; rules: Rule[] } | null = null;
  let lastWasAgent = false;
  for (const raw of text.slice(0, 100_000).split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "sitemap") {
      if (sitemaps.length < 5) sitemaps.push(value);
      continue;
    }
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === "disallow" || key === "allow") current.rules.push({ allow: key === "allow", pattern: value });
  }
  const own = groups.filter((g) => g.agents.some((a) => a !== "*" && agent.includes(a)));
  const rules = (own.length ? own : groups.filter((g) => g.agents.includes("*"))).flatMap((g) => g.rules);
  return { rules, sitemaps };
}
function ruleMatches(pattern: string, path: string) {
  if (!pattern) return false;
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`).test(path);
}
/** Longest matching rule wins; Allow wins a tie; no rule = allowed. */
export function robotsAllows(rules: Rule[], pathWithQuery: string) {
  let best: Rule | null = null;
  for (const r of rules)
    if (ruleMatches(r.pattern, pathWithQuery))
      if (!best || r.pattern.length > best.pattern.length || (r.pattern.length === best.pattern.length && r.allow))
        best = r;
  return best ? best.allow : true;
}

// ------------------------------------------------------------------ link selection

const KINDS: { kind: string; score: number; re: RegExp }[] = [
  { kind: "contact", score: 10, re: /contact|nous-joindre|coordonn|joindre|acces|plan-d-acces/ },
  { kind: "prices", score: 9, re: /tarif|prix|forfait|price|pricing|cout/ },
  { kind: "services", score: 9, re: /service|prestation|metier|activite|savoir-faire|travaux|nos-offres|offre|expertise|solutions/ },
  { kind: "zone", score: 8, re: /zone|secteur|intervention|villes|communes|localisation|ou-nous-trouver|region/ },
  { kind: "faq", score: 8, re: /faq|questions/ },
  { kind: "about", score: 7, re: /a-propos|qui-sommes|about|entreprise|notre-histoire|presentation|equipe|societe/ },
  { kind: "legal", score: 6, re: /mentions|legal|cgv|conditions-generales|impressum/ },
  { kind: "references", score: 3, re: /realisation|reference|chantier|projet|portfolio|galerie|avis|temoignage/ },
];
const SKIP_PATH = /\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|pptx?|mp4|mp3|xml|json|css|js)$|\/(wp-admin|wp-login|login|connexion|compte|account|panier|cart|checkout|feed|tag|author|wp-json|cdn-cgi)(\/|$)|\/(blog|actualites?|news|articles?)\/./i;

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9/]+/g, "-");
const sameSite = (a: URL, b: URL) => a.hostname.replace(/^www\./, "") === b.hostname.replace(/^www\./, "");

/** Up to `max` same-site URLs, at most one per kind (two for services), best first. */
export function pickPages(home: URL, links: { href: string; text: string }[], max: number) {
  const seen = new Set<string>([home.origin + home.pathname]);
  const scored: { url: string; kind: string; score: number }[] = [];
  for (const link of links) {
    let u: URL;
    try {
      u = new URL(link.href);
    } catch {
      continue;
    }
    if (u.protocol !== "https:" || !sameSite(u, home) || u.username || u.password || (u.port && u.port !== "443")) continue;
    if (SKIP_PATH.test(u.pathname) || u.search.length > 40) continue;
    u.hash = "";
    const key = u.origin + u.pathname.replace(/\/$/, "");
    if (seen.has(key) || seen.has(`${key}/`)) continue;
    const hay = `${fold(u.pathname)} ${fold(link.text)}`;
    const match = KINDS.find((k) => k.re.test(hay));
    if (!match) continue;
    seen.add(key);
    // Shallow pages first: /contact beats /blog/2021/contact-us.
    const depth = u.pathname.split("/").filter(Boolean).length;
    scored.push({ url: u.href, kind: match.kind, score: match.score - Math.max(0, depth - 1) * 2 });
  }
  scored.sort((a, b) => b.score - a.score);
  const perKind = new Map<string, number>();
  const out: string[] = [];
  for (const s of scored) {
    const n = perKind.get(s.kind) ?? 0;
    if (n >= (s.kind === "services" ? 2 : 1)) continue;
    perKind.set(s.kind, n + 1);
    out.push(s.url);
    if (out.length >= max) break;
  }
  return out;
}

/** <loc> entries of a sitemap (or the child sitemaps of an index). */
export function sitemapLocs(xml: string) {
  const locs = [...xml.slice(0, 500_000).matchAll(/<loc>\s*([^<\s]{1,500})\s*<\/loc>/gi)].map((m) =>
    m[1].replace(/&amp;/g, "&"),
  );
  return { index: /<sitemapindex/i.test(xml), locs: locs.slice(0, 500) };
}

// ------------------------------------------------------------------ crawl

const defaultFetcher: Fetcher = (url, options) => fetchPublicResource(url, options);

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

export async function crawlSite(raw: string, options: CrawlOptions = {}, fetcher: Fetcher = defaultFetcher): Promise<CrawlResult> {
  const o = { ...CRAWL_DEFAULTS, ...options };
  const started = Date.now();
  const deadline = started + o.budgetMs;
  const remaining = () => deadline - Date.now();
  const timeout = (ms: number) => AbortSignal.timeout(Math.max(1, Math.min(ms, remaining())));
  const start = publicWebsite(raw);
  const skipped: CrawlResult["skipped"] = [];

  // Home and robots.txt in parallel; a missing robots.txt allows everything.
  const robotsPromise = fetcher(new URL("/robots.txt", start).href, {
    signal: timeout(4_000),
    accept: ["text/plain"],
    maxBytes: 100_000,
  })
    .then((r) => parseRobots(r.body))
    .catch(() => parseRobots(""));
  const homeResource = await fetcher(start.href, { signal: timeout(o.homeTimeoutMs), maxBytes: o.maxPageBytes });
  const home = parseSitePage(homeResource.body, homeResource.url);
  const homeUrl = new URL(homeResource.url);
  // The final URL after redirects must still be a public HTTPS site.
  publicWebsite(homeUrl.href);
  let totalBytes = homeResource.body.length;
  const robots = await robotsPromise;

  let candidates = pickPages(homeUrl, home.links, o.maxPages);
  if (candidates.length < o.maxPages && remaining() > 3_000) {
    const sitemapUrls = robots.sitemaps.length ? robots.sitemaps : [new URL("/sitemap.xml", homeUrl).href];
    try {
      const sitemapUrl = sitemapUrls.find((s) => {
        try {
          return sameSite(new URL(s), homeUrl);
        } catch {
          return false;
        }
      });
      if (sitemapUrl) {
        const xmlAccept = ["xml"];
        let map = sitemapLocs(
          (await fetcher(sitemapUrl, { signal: timeout(3_000), accept: xmlAccept, maxBytes: 500_000 })).body,
        );
        if (map.index && map.locs[0] && remaining() > 3_000) {
          const child = map.locs.find((l) => /page/i.test(l)) ?? map.locs[0];
          if (sameSite(new URL(child), homeUrl))
            map = sitemapLocs((await fetcher(child, { signal: timeout(3_000), accept: xmlAccept, maxBytes: 500_000 })).body);
        }
        if (!map.index) {
          const more = pickPages(
            homeUrl,
            map.locs.map((href) => ({ href, text: "" })),
            o.maxPages,
          ).filter((u) => !candidates.includes(u));
          candidates = [...candidates, ...more].slice(0, o.maxPages);
        }
      }
    } catch {
      /* no usable sitemap: links only */
    }
  }

  const pages: SitePage[] = [home];
  const read = new Map<string, SitePage>();
  const allowed = candidates.filter((url) => {
    const u = new URL(url);
    if (robotsAllows(robots.rules, u.pathname + u.search)) return true;
    skipped.push({ url, reason: "robots" });
    return false;
  });
  await pool(allowed, o.concurrency, async (url) => {
    if (remaining() < 800) {
      skipped.push({ url, reason: "budget" });
      return;
    }
    if (totalBytes >= o.maxTotalBytes) {
      skipped.push({ url, reason: "bytes" });
      return;
    }
    try {
      const r = await fetcher(url, { signal: timeout(o.pageTimeoutMs), maxBytes: o.maxPageBytes });
      const final = new URL(r.url);
      // A redirect may leave the site: such pages are dropped.
      if (!sameSite(final, homeUrl)) {
        skipped.push({ url, reason: "error" });
        return;
      }
      totalBytes += r.body.length;
      read.set(url, parseSitePage(r.body, r.url));
    } catch (e) {
      skipped.push({ url, reason: e instanceof Error && /HTML/.test(e.message) ? "not_html" : remaining() < 50 ? "budget" : "error" });
    }
  });
  // Deterministic order (candidate rank), whatever the completion order.
  for (const url of allowed) {
    const page = read.get(url);
    if (page && !pages.some((p) => p.url === page.url)) pages.push(page);
  }
  return {
    pages,
    website: homeUrl.href,
    readMs: Date.now() - started,
    skipped,
    instructionsRemoved: pages.reduce((n, p) => n + p.instructionsRemoved, 0),
  };
}
