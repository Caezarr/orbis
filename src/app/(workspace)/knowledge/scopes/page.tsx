import { notFound } from "next/navigation";
import { KnowledgeScope } from "@/components/product/KnowledgeScope";
import { getRequestStore } from "@/lib/platform/request";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ mission?: string }>;
}) {
  const { mission } = await searchParams;
  const state = await getRequestStore();
  if (
    !state.missions.some(
      (m) => m.id === mission && m.tenantId === state.workspace.tenantId,
    )
  )
    notFound();
  return <KnowledgeScope missionId={mission!} />;
}
