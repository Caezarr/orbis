import type { MetadataRoute } from "next";
import { getAllJobParams, hubs } from "@/data/verticals";
import { SITE_URL } from "@/lib/site";

/**
 * Only URLs an anonymous visitor (and a crawler) can reach without being
 * redirected to /login. See the public allow-list in src/proxy.ts.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const entry = (path: string, priority: number) => ({
    url: `${SITE_URL}${path}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority,
  });
  return [
    entry("", 1.0),
    entry("/catalog", 0.8),
    entry("/for", 0.8),
    ...hubs.map((h) => entry(`/for/${h.slug}`, 0.7)),
    ...getAllJobParams().map(({ hub, job }) => entry(`/for/${hub}/${job}`, 0.6)),
  ];
}
