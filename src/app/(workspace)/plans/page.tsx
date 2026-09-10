import { Plans } from "@/components/product/Plans";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; flow?: string }>;
}) {
  const p = await searchParams;
  return <Plans key={p.id} auditId={p.id} flowId={p.flow} />;
}
