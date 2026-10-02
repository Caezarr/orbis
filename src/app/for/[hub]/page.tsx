import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VerticalLanding } from "@/components/landing/VerticalLanding";
import { auditHref, getHub, hubs, pricingFaq } from "@/data/verticals";
import { SITE_URL } from "@/lib/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return hubs.map((h) => ({ hub: h.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/for/[hub]">): Promise<Metadata> {
  const { hub: slug } = await params;
  const hub = getHub(slug);
  if (!hub) return {};
  const title = `${hub.seoTitle} | Orbis`;
  const url = `${SITE_URL}/for/${hub.slug}`;
  return {
    title,
    description: hub.lead,
    alternates: { canonical: url },
    openGraph: { type: "website", siteName: "Orbis", url, title, description: hub.lead },
  };
}

export default async function HubPage({ params }: PageProps<"/for/[hub]">) {
  const { hub: slug } = await params;
  const hub = getHub(slug);
  if (!hub) notFound();
  return (
    <VerticalLanding
      hub={hub}
      faq={[...hub.faq, pricingFaq()]}
      auditHref={auditHref()}
    />
  );
}
