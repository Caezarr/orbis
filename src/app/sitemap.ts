import type { MetadataRoute } from "next";
import { getHubs, getAllJobs } from "@/data/verticals/wave1";

const BASE_URL = "https://orbis-omega-ashen.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    "",
    "/audit",
    "/catalog",
    "/discover",
    "/pricing",
    "/for",
  ];

  const staticPages = routes.map((route) => ({
    url: `${BASE_URL}${route}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: route === "" ? 1.0 : 0.8,
  }));

  // Hub pages
  const hubs = getHubs();
  const hubPages = hubs.map((hub) => ({
    url: `${BASE_URL}/for/${hub}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  // Job pages
  const jobs = getAllJobs();
  const jobPages = jobs.map(({ hub, job }) => ({
    url: `${BASE_URL}/for/${hub}/${job}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  return [...staticPages, ...hubPages, ...jobPages];
}
