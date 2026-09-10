import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VerticalLanding } from "@/components/landing/VerticalLanding";
import {
  getHubs,
  getHubMeta,
  getJobsByHub,
} from "@/data/verticals/wave1";
import { extractUtmParams } from "@/lib/visual/utm";

interface PageProps {
  params: Promise<{ hub: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateStaticParams() {
  const hubs = getHubs();
  return hubs.map((hub) => ({
    hub,
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { hub } = await params;
  const hubMeta = getHubMeta(hub);

  if (!hubMeta) {
    return {
      title: "Not Found — Orbis",
    };
  }

  const title = `${hubMeta.label} — Orbis`;
  const description = hubMeta.tagline + " " + hubMeta.pain;

  return {
    title,
    description,
  };
}

export default async function HubPage({ params, searchParams }: PageProps) {
  const { hub } = await params;
  const resolvedSearchParams = await searchParams;
  
  const hubMeta = getHubMeta(hub);
  const jobs = getJobsByHub(hub);

  if (!hubMeta || jobs.length === 0) {
    notFound();
  }

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
      type="hub"
      hub={hub}
      hubLabel={hubMeta.label}
      tagline={hubMeta.tagline}
      pain={hubMeta.pain}
      jobs={jobs}
      utm={utm}
    />
  );
}
