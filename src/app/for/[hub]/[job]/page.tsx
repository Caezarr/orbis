import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VerticalLanding } from "@/components/landing/VerticalLanding";
import {
  getHubs,
  getHubMeta,
  getJobsByHub,
  getJob,
  getJobLabel,
  getAllJobs,
} from "@/data/verticals/wave1";
import { extractUtmParams } from "@/lib/visual/utm";

interface PageProps {
  params: Promise<{ hub: string; job: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateStaticParams() {
  const allJobs = getAllJobs();
  return allJobs.map(({ hub, job }) => ({
    hub,
    job,
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { hub, job } = await params;
  const hubMeta = getHubMeta(hub);
  const jobData = getJob(hub, job);

  if (!hubMeta || !jobData) {
    return {
      title: "Not Found — Orbis",
    };
  }

  const jobLabel = getJobLabel(job);
  const title = `${jobLabel} for ${hubMeta.label} — Orbis`;
  const description = `Install ${jobLabel} into your company. Stop stitching together ChatGPT tabs. Get ${jobLabel} that works, powered by your company's context.`;

  return {
    title,
    description,
  };
}

export default async function JobPage({ params, searchParams }: PageProps) {
  const { hub, job } = await params;
  const resolvedSearchParams = await searchParams;
  
  const hubMeta = getHubMeta(hub);
  const jobData = getJob(hub, job);

  if (!hubMeta || !jobData) {
    notFound();
  }

  const siblingJobs = getJobsByHub(hub);
  
  // Extract UTM params
  const searchParamsObj = new URLSearchParams();
  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    if (typeof value === "string") {
      searchParamsObj.set(key, value);
    }
  }
  const utm = extractUtmParams(searchParamsObj);

  return (
    <VerticalLanding
      type="job"
      hub={hub}
      hubLabel={hubMeta.label}
      tagline={hubMeta.tagline}
      pain={hubMeta.pain}
      job={job}
      jobs={siblingJobs}
      siblingJobs={siblingJobs}
      utm={utm}
    />
  );
}
