import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VerticalLanding } from "@/components/landing/VerticalLanding";
import {
  getHubs,
  getHubMeta,
  getJobsByHub,
  parseMotionJobs,
} from "@/data/verticals/wave1";
import { extractUtmParams } from "@/lib/visual/utm";

interface PageProps {
  params: Promise<{ hub: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateStaticParams() {
  return getHubs().map((hub) => ({ hub }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { hub } = await params;
  const hubMeta = getHubMeta(hub);
  if (!hubMeta) return { title: "Not Found — Orbis" };
  return {
    title: `${hubMeta.label} — Orbis`,
    description: hubMeta.h2 || `${hubMeta.tagline} ${hubMeta.pain}`,
  };
}

export default async function HubPage({ params, searchParams }: PageProps) {
  const { hub } = await params;
  const resolvedSearchParams = await searchParams;
  const hubMeta = getHubMeta(hub);
  const jobs = getJobsByHub(hub);
  if (!hubMeta || jobs.length === 0) notFound();

  const searchParamsObj = new URLSearchParams();
  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    if (typeof value === "string") searchParamsObj.set(key, value);
  }
  const utm = extractUtmParams(searchParamsObj);
  const workshopJobs = parseMotionJobs(hubMeta.motionJobs).map((s) => ({
    input: s.action,
    output: s.result,
    detail: s.detail || "",
  }));

  return (
    <VerticalLanding
      type="hub"
      hub={hub}
      hubLabel={hubMeta.label}
      tagline={hubMeta.tagline}
      pain={hubMeta.pain}
      h2={hubMeta.h2}
      badge={hubMeta.badge}
      icp={hubMeta.icp}
      micro={hubMeta.micro}
      finalH2={hubMeta.finalTitle}
      valueStack={hubMeta.valueStack}
      costLines={hubMeta.costLines}
      workshopJobs={workshopJobs}
      jobs={jobs}
      utm={utm}
    />
  );
}
