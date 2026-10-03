import { lookup } from "node:dns/promises";
import { request } from "node:https";
import ipaddr from "ipaddr.js";
import { load } from "cheerio";
import { brokerDecide } from "./broker";

export function publicAddress(address: string) {
  try {
    return ipaddr.process(address).range() === "unicast";
  } catch {
    return false;
  }
}
export function publicWebsite(raw: string) {
  const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    /(^localhost$|\.local$|\.internal$)/i.test(url.hostname)
  )
    throw new Error(
      "Utilisez l’adresse HTTPS d’un site public, sans identifiants.",
    );
  url.hash = "";
  return url;
}
export function extractCompany(html: string, url: string) {
  const $ = load(html);
  $("script,style,nav,footer,header,noscript,svg,form,iframe").remove();
  const title =
    $("meta[property='og:site_name']").attr("content") || $("title").text();
  const description =
    $("meta[name='description']").attr("content") ||
    $("meta[property='og:description']").attr("content") ||
    "";
  const text = $("main").text() || $("body").text();
  return {
    website: url,
    title: title.trim().slice(0, 120),
    description: description.trim().slice(0, 1500),
    excerpt: text.replace(/\s+/g, " ").trim().slice(0, 6000),
    fetchedAt: new Date().toISOString(),
  };
}

export type PublicFetchOptions = {
  signal: AbortSignal;
  /** Accepted content types (substring match on the Content-Type header). */
  accept?: string[];
  maxBytes?: number;
  maxHops?: number;
};
export type PublicResource = { url: string; contentType: string; body: string };

function abortable<T>(promise: Promise<T>, signal: AbortSignal) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      if (signal.aborted) reject(new Error("Délai dépassé."));
      signal.addEventListener("abort", () => reject(new Error("Délai dépassé.")), { once: true });
    }),
  ]);
}

/**
 * One SSRF-guarded GET through the read-only broker: HTTPS only, every hop
 * resolved and checked against private/reserved ranges, the validated IP pinned
 * for the connection (defeats DNS rebinding), identity encoding, size cap.
 * Shared by the single-page reader and the bounded /start crawl.
 */
export async function fetchPublicResource(raw: string | URL, options: PublicFetchOptions): Promise<PublicResource> {
  const decision = brokerDecide("read_public_company_site", "test");
  if (!decision.allowed) throw new Error("Lecture du site refusée.");
  const { signal } = options;
  const accept = options.accept ?? ["text/html"];
  const maxBytes = options.maxBytes ?? 1_000_000;
  let url = publicWebsite(typeof raw === "string" ? raw : raw.href);
  for (let hop = 0; hop < (options.maxHops ?? 4); hop++) {
    const answers = await abortable(lookup(url.hostname.replace(/^\[|\]$/g, ""), { all: true }), signal);
    if (!answers.length || answers.some((a) => !publicAddress(a.address)))
      throw new Error("Les adresses privées ou réservées ne sont pas autorisées.");
    const address = answers[0];
    const response = await new Promise<{ status: number; location?: string; body: string; contentType: string }>(
      (resolve, reject) => {
        const req = request(
          url,
          {
            method: "GET",
            signal,
            headers: {
              Accept: accept.join(", "),
              "Accept-Encoding": "identity",
              "User-Agent": "OrbisCompanyReader/1.0",
            },
            lookup: (_hostname, opts, callback) => {
              if (opts.all) callback(null, [address]);
              else callback(null, address.address, address.family);
            },
          },
          (res) => {
            const status = res.statusCode ?? 500;
            const contentType = String(res.headers["content-type"] ?? "");
            if ([301, 302, 303, 307, 308].includes(status)) {
              res.resume();
              resolve({ status, location: res.headers.location, body: "", contentType });
              return;
            }
            if (status !== 200 || !accept.some((type) => contentType.includes(type))) {
              res.resume();
              reject(
                new Error(
                  "Ce site ne fournit pas de page HTML publique lisible. Décrivez votre activité pour continuer.",
                ),
              );
              return;
            }
            if (res.headers["content-encoding"] && res.headers["content-encoding"] !== "identity") {
              res.destroy();
              reject(new Error("Format de page non pris en charge."));
              return;
            }
            let size = 0;
            const chunks: Buffer[] = [];
            res.on("data", (chunk) => {
              size += chunk.length;
              if (size > maxBytes) {
                res.destroy(new Error("Page trop volumineuse."));
                return;
              }
              chunks.push(Buffer.from(chunk));
            });
            res.on("error", reject);
            res.on("end", () => resolve({ status, body: Buffer.concat(chunks).toString("utf8"), contentType }));
          },
        );
        req.on("error", reject);
        req.end();
      },
    );
    if (response.location) {
      url = publicWebsite(new URL(response.location, url).href);
      continue;
    }
    return { url: url.href, contentType: response.contentType, body: response.body };
  }
  throw new Error("Trop de redirections. Décrivez votre activité pour continuer.");
}

/** Read-only broker entry: one public page, reduced to title/description/excerpt. */
export async function readCompanySite(raw: string) {
  const page = await fetchPublicResource(raw, { signal: AbortSignal.timeout(15000) });
  return extractCompany(page.body, page.url);
}
