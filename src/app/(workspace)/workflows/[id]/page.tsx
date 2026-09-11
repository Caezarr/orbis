import { notFound } from "next/navigation";
import { businessWorkflows } from "@/lib/workflows/blueprints";
import { WorkflowBlueprint } from "@/components/product/WorkflowBlueprint";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const blueprint = businessWorkflows.find((w) => w.id === id);
  if (!blueprint) notFound();
  return <WorkflowBlueprint blueprint={blueprint} />;
}
