import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VerticalLanding } from "@/components/landing/VerticalLanding";
import { auditHref, getAllJobParams, getHub, getJob } from "@/data/verticals";
import { contracts } from "@/lib/runtime/contracts";
import { SITE_URL } from "@/lib/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return getAllJobParams();
}

export async function generateMetadata({
  params,
}: PageProps<"/for/[hub]/[job]">): Promise<Metadata> {
  const { hub: hubSlug, job: jobSlug } = await params;
  const hub = getHub(hubSlug);
  const job = getJob(hubSlug, jobSlug);
  if (!hub || !job) return {};
  const title = `${job.label} for ${hub.label} | Orbis`;
  const url = `${SITE_URL}/for/${hub.slug}/${job.slug}`;
  return {
    title,
    description: job.summary,
    alternates: { canonical: url },
    openGraph: { type: "website", siteName: "Orbis", url, title, description: job.summary },
  };
}

export default async function JobPage({ params }: PageProps<"/for/[hub]/[job]">) {
  const { hub: hubSlug, job: jobSlug } = await params;
  const hub = getHub(hubSlug);
  const job = getJob(hubSlug, jobSlug);
  if (!hub || !job) notFound();
  return (
    <VerticalLanding
      hub={hub}
      job={job}
      contractLabel={contracts[job.contract]?.label}
      faq={job.faq}
      auditHref={auditHref(job)}
    />
  );
}
