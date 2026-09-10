import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/onboarding/"],
    },
    sitemap: "https://orbis-omega-ashen.vercel.app/sitemap.xml",
  };
}
