import { Audit } from "@/components/product/Audit";
import { getHubMeta, getJobLabel } from "@/data/verticals/wave1";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    flow?: string;
    audience?: string;
    website?: string;
    from?: string;
    seats?: string;
    vertical?: string;
    job?: string;
  }>;
}) {
  const p = await searchParams;
  const count = Number(p.seats);
  const seats =
    Number.isInteger(count) && count >= 1 && count <= 50 ? count : undefined;
  const vertical = p.vertical;
  const job = p.job;
  const hubMeta = vertical ? getHubMeta(vertical) : undefined;
  const verticalLabel = hubMeta?.label;
  const jobLabel = job ? getJobLabel(job) : undefined;
  return (
    <Audit
      seats={seats}
      flowId={p.flow}
      audience={p.audience}
      website={p.website}
      fromDescription={p.from === "description"}
      vertical={vertical}
      job={job}
      verticalLabel={verticalLabel}
      jobLabel={jobLabel}
    />
  );
}
