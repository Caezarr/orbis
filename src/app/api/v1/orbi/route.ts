import { z } from "zod";
import { withWorkspaceRequest } from "@/lib/platform/request";
import { getStore, mutateStore } from "@/lib/store/store";
import { providerStatus } from "@/lib/runtime/provider";
import { guideWithOrbi } from "@/lib/runtime/orbi-guidance";
import { id } from "@/lib/ids";
export const maxDuration = 60;
export async function POST(request: Request) {
  return withWorkspaceRequest(request, async () => {
    const parsed = z.object({text:z.string().trim().min(8).max(8000)}).safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({error:"Describe the work in 8–8,000 characters."},{status:400});
    if (!providerStatus().configured) return Response.json({error:"Orbi needs an AI connection. You can still choose a workflow from the marketplace."},{status:503});
    const state = getStore();
    const recent = state.outbox.filter(e => e.type === "orbi.guidance" && Date.parse(e.createdAt) > Date.now() - 3_600_000);
    if (recent.length >= 12) return Response.json({error:"Your workspace has reached its hourly conversation limit. Continue with the marketplace or try again later."},{status:429});
    // Record failed attempts as well. No fake response or success is persisted.
    mutateStore(s => s.outbox.push({id:id("evt"),tenantId:s.workspace.tenantId,type:"orbi.guidance",payload:{},createdAt:new Date().toISOString()}));
    try { return Response.json(await guideWithOrbi(parsed.data.text, state.profile?.summary ?? "No company profile confirmed yet.")); }
    catch { return Response.json({error:"Orbi could not prepare a recommendation. Try again, or choose a workflow below.",retryable:true}); }
  });
}
