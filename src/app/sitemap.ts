import type { MetadataRoute } from "next";

const BASE_URL = "https://orbis-omega-ashen.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    "",
    "/audit",
    "/catalog",
    "/discover",
    "/pricing",
  ];

  return routes.map((route) => ({
    url: `${BASE_URL}${route}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: route === "" ? 1.0 : 0.8,
  }));
}
