import { load, type CheerioAPI } from "cheerio";
import { injectionSignals } from "@/lib/runtime/inbox-replies";
import { normalizeUntrusted } from "@/lib/security/untrusted-text";

/*
 * Server-only: turns one public HTML page into ordered text segments (one per
 * visible block, whitespace-normalised, never rewritten), its links and its
 * schema.org JSON-LD. Extractors quote these segments verbatim. Page content is
 * untrusted: hidden elements are skipped and instruction-like segments are
 * dropped (counted in `instructionsRemoved`), so they can never become a
 * "fact" nor reach a model.
 */

export type Segment = {
  text: string;
  /** Closest block tag ("p", "li", "h2", …). */
  tag: string;
  /** Enclosing headings, outermost first (for a heading: its parents only). */
  path: string[];
  /** Inside <nav> or a menu: links, not statements. */
  nav: boolean;
};
export type PageLink = { href: string; text: string };
export type SitePage = {
  url: string;
  title: string;
  description: string;
  siteName: string;
  segments: Segment[];
  links: PageLink[];
  jsonLd: Record<string, unknown>[];
  instructionsRemoved: number;
};

export const MAX_SEGMENTS = 600;
const MAX_SEGMENT_CHARS = 1200;

const BLOCK = new Set(
  "p div section article main header footer aside nav li ul ol dl dt dd h1 h2 h3 h4 h5 h6 table thead tbody tr td th address blockquote figure figcaption details summary fieldset legend pre hr br button label".split(
    " ",
  ),
);
const HEADING = /^h[1-6]$/;
const DROP = "script,style,noscript,svg,iframe,template,object,embed,canvas,select,option,textarea,input,form";

const clean = (s: string) => normalizeUntrusted(s).replace(/\s+/g, " ").trim();
/** Edge of a styled inline element (often rendered as its own line: "Peintre<span class=…>en bâtiment</span>"). */
const BOUNDARY = "\u0000";
const joinBoundaries = (s: string) =>
  s.replace(/([\p{L}\d])\u0000+(?=[\p{L}\d])/gu, "$1 ").replaceAll(BOUNDARY, "");

/** Minimal view of the parsed DOM (cheerio's domhandler nodes). */
type DomNode = { type: string; data?: string; name?: string; attribs?: Record<string, string>; children?: DomNode[] };

function hidden(el: DomNode) {
  const a = el.attribs ?? {};
  if ("hidden" in a) return true;
  const style = (a.style ?? "").replace(/\s+/g, "").toLowerCase();
  return /display:none|visibility:hidden|opacity:0(?![.\d])|font-size:0(?![.\d])|(?:^|;)(?:width|height):0(?:px)?(?:;|$)/.test(style);
}

function jsonLdBlocks($: CheerioAPI) {
  const out: Record<string, unknown>[] = [];
  $("script[type='application/ld+json']").each((_, el) => {
    const raw = $(el).text();
    if (raw.length > 200_000) return;
    try {
      const flatten = (v: unknown) => {
        if (Array.isArray(v)) v.forEach(flatten);
        else if (v && typeof v === "object") {
          const o = v as Record<string, unknown>;
          if (Array.isArray(o["@graph"])) (o["@graph"] as unknown[]).forEach(flatten);
          else out.push(o);
        }
      };
      flatten(JSON.parse(raw));
    } catch {
      /* malformed JSON-LD is ignored */
    }
  });
  return out.slice(0, 40);
}

export function parseSitePage(html: string, url: string): SitePage {
  const $ = load(html);
  const jsonLd = jsonLdBlocks($);
  let instructionsRemoved = 0;
  const safe = (text: string) => {
    if (!injectionSignals(text).length) return text;
    instructionsRemoved++;
    return "";
  };
  const title = safe(clean($("title").first().text()).slice(0, 200));
  const description = safe(
    clean(
      $("meta[name='description']").attr("content") || $("meta[property='og:description']").attr("content") || "",
    ).slice(0, 1500),
  );
  const siteName = safe(clean($("meta[property='og:site_name']").attr("content") || "").slice(0, 120));
  const links: PageLink[] = [];
  $("a[href]").each((_, el) => {
    if (links.length >= 400) return;
    const href = $(el).attr("href") ?? "";
    try {
      const abs = new URL(href, url);
      if (!/^(https?|mailto|tel):$/.test(abs.protocol)) return;
      links.push({ href: abs.href, text: clean($(el).text()).slice(0, 120) });
    } catch {
      /* invalid href */
    }
  });
  $(DROP).remove();

  const segments: Segment[] = [];
  let buffer = "";
  // Open headings, outermost first: [{level, text}].
  const stack: { level: number; text: string }[] = [];
  const flush = (tag: string, nav: boolean) => {
    const text = clean(joinBoundaries(buffer));
    buffer = "";
    if (!text || segments.length >= MAX_SEGMENTS) return;
    if (injectionSignals(text).length) {
      instructionsRemoved++;
      return;
    }
    const clipped = text.slice(0, MAX_SEGMENT_CHARS);
    if (HEADING.test(tag)) {
      const level = Number(tag[1]);
      while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
      segments.push({ text: clipped, tag, path: stack.map((h) => h.text), nav });
      stack.push({ level, text: clipped.slice(0, 160) });
      return;
    }
    segments.push({ text: clipped, tag, path: stack.map((h) => h.text), nav });
  };
  const walk = (el: DomNode, tag: string, nav: boolean) => {
    if (el.type === "text") {
      buffer += el.data ?? "";
      return;
    }
    if (el.type !== "tag" || !el.name) return;
    if (hidden(el)) return;
    const name = el.name.toLowerCase();
    const isBlock = BLOCK.has(name);
    const childNav = nav || name === "nav" || el.attribs?.role === "navigation" || el.attribs?.role === "menu";
    if (isBlock) flush(tag, nav);
    const childTag = isBlock ? name : tag;
    const styled = !isBlock && !!el.attribs?.class;
    if (styled) buffer += BOUNDARY;
    for (const child of el.children ?? []) walk(child, childTag, childNav);
    if (styled) buffer += BOUNDARY;
    if (isBlock) flush(childTag, childNav);
  };
  const body = $("body").get(0) as unknown as DomNode | undefined;
  if (body) for (const child of body.children ?? []) walk(child, "div", false);
  flush("div", false);

  return { url, title, description, siteName, segments, links, jsonLd, instructionsRemoved };
}

/** The page as verifiable text: what quotes and model citations are checked against. */
export function pageCorpus(page: SitePage) {
  return [page.title, page.description, ...page.segments.map((s) => s.text)].filter(Boolean).join("\n");
}
