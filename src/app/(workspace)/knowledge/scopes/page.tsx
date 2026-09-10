import { notFound } from "next/navigation";
import { KnowledgeScope } from "@/components/product/KnowledgeScope";
import { getStore } from "@/lib/store/store";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ mission?: string }>;
}) {
  const { mission } = await searchParams;
  const state = getStore();
  if (
    !state.missions.some(
      (m) => m.id === mission && m.tenantId === state.workspace.tenantId,
    )
  )
    notFound();
  return <KnowledgeScope missionId={mission!} />;
}
