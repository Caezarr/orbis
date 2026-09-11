import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VerticalLanding } from "@/components/landing/VerticalLanding";
import {
  getHubMeta,
  getJobsByHub,
  getJob,
  getJobLabel,
  getAllJobs,
  parseMotionJobs,
  parseTools,
} from "@/data/verticals/wave1";
import { extractUtmParams } from "@/lib/visual/utm";

interface PageProps {
  params: Promise<{ hub: string; job: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateStaticParams() {
  return getAllJobs().map(({ hub, job }) => ({ hub, job }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { hub, job } = await params;
  const hubMeta = getHubMeta(hub);
  const jobData = getJob(hub, job);
  if (!hubMeta || !jobData) return { title: "Not Found — Orbis" };
  const jobLabel = getJobLabel(job);
  return {
    title: `${jobLabel} for ${hubMeta.label} — Orbis`,
    description: jobData.h2,
  };
}

export default async function JobPage({ params, searchParams }: PageProps) {
  const { hub, job } = await params;
  const resolvedSearchParams = await searchParams;
  const hubMeta = getHubMeta(hub);
  const jobData = getJob(hub, job);
  if (!hubMeta || !jobData) notFound();
  const siblingJobs = getJobsByHub(hub);

  const searchParamsObj = new URLSearchParams();
  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    if (typeof value === "string") searchParamsObj.set(key, value);
  }
  const utm = extractUtmParams(searchParamsObj);

  const workshopJobs = parseMotionJobs(jobData.motionJobs).map((s) => ({
    input: s.action,
    output: s.result,
    detail: s.detail || "",
  }));

  return (
    <VerticalLanding
      type="job"
      hub={hub}
      hubLabel={hubMeta.label}
      tagline={jobData.h1}
      pain={jobData.h2}
      h2={jobData.h2}
      badge={jobData.badge}
      icp={jobData.icp}
      micro={jobData.micro}
      finalH2={jobData.finalTitle}
      valueStack={jobData.valueStack}
      costLines={jobData.costLines}
      faq={jobData.faq}
      workshopJobs={workshopJobs}
      tools={parseTools(jobData.tools)}
      job={job}
      jobs={siblingJobs}
      siblingJobs={siblingJobs}
      utm={utm}
    />
  );
}
