import { Audit } from "@/components/product/Audit";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    flow?: string;
    audience?: string;
    website?: string;
    from?: string;
    seats?: string;
  }>;
}) {
  const p = await searchParams;
  const count = Number(p.seats);
  const seats =
    Number.isInteger(count) && count >= 1 && count <= 50 ? count : undefined;
  return (
    <Audit
      seats={seats}
      flowId={p.flow}
      audience={p.audience}
      website={p.website}
      fromDescription={p.from === "description"}
    />
  );
}
