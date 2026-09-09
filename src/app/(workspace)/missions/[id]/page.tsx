import { redirect } from "next/navigation";

export default async function MissionIndex({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/missions/${id}/lab`);
}
