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

/** Read-only broker entry. Resolve every hop; pin the validated IP to defeat DNS rebinding. */
export async function readCompanySite(raw: string) {
  const decision = brokerDecide("read_public_company_site", "test");
  if (!decision.allowed) throw new Error("Lecture du site refusée.");
  const deadline = AbortSignal.timeout(15000);
  let url = publicWebsite(raw);
  for (let hop = 0; hop < 4; hop++) {
    const answers = await Promise.race([
      lookup(url.hostname.replace(/^\[|\]$/g, ""), { all: true }),
      new Promise<never>((_, reject) => {
        deadline.addEventListener(
          "abort",
          () => reject(new Error("Délai dépassé.")),
          { once: true },
        );
        if (deadline.aborted) reject(new Error("Délai dépassé."));
      }),
    ]);
    if (!answers.length || answers.some((a) => !publicAddress(a.address)))
      throw new Error(
        "Les adresses privées ou réservées ne sont pas autorisées.",
      );
    const address = answers[0];
    const response = await new Promise<{
      status: number;
      location?: string;
      html: string;
    }>((resolve, reject) => {
      const req = request(
        url,
        {
          method: "GET",
          signal: deadline,
          headers: {
            Accept: "text/html",
            "Accept-Encoding": "identity",
            "User-Agent": "OrbisCompanyReader/1.0",
          },
          lookup: (_hostname, options, callback) => {
            if (options.all) callback(null, [address]);
            else callback(null, address.address, address.family);
          },
        },
        (res) => {
          const status = res.statusCode ?? 500;
          if ([301, 302, 303, 307, 308].includes(status)) {
            res.resume();
            resolve({ status, location: res.headers.location, html: "" });
            return;
          }
          if (
            status !== 200 ||
            !res.headers["content-type"]?.includes("text/html")
          ) {
            res.resume();
            reject(
              new Error(
                "Ce site ne fournit pas de page HTML publique lisible. Décrivez votre activité pour continuer.",
              ),
            );
            return;
          }
          if (
            res.headers["content-encoding"] &&
            res.headers["content-encoding"] !== "identity"
          ) {
            res.destroy();
            reject(new Error("Format de page non pris en charge."));
            return;
          }
          let size = 0;
          const chunks: Buffer[] = [];
          res.on("data", (chunk) => {
            size += chunk.length;
            if (size > 1000000) {
              res.destroy(new Error("Page trop volumineuse."));
              return;
            }
            chunks.push(Buffer.from(chunk));
          });
          res.on("error", reject);
          res.on("end", () =>
            resolve({ status, html: Buffer.concat(chunks).toString("utf8") }),
          );
        },
      );
      req.on("error", reject);
      req.end();
    });
    if (response.location) {
      url = publicWebsite(new URL(response.location, url).href);
      continue;
    }
    return extractCompany(response.html, url.href);
  }
  throw new Error(
    "Trop de redirections. Décrivez votre activité pour continuer.",
  );
}
