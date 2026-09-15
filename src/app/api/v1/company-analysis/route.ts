import { z } from "zod";
import { withWorkspaceRequest } from "@/lib/platform/request";
import { getStore, mutateStore } from "@/lib/store/store";
import { providerStatus } from "@/lib/runtime/provider";
import { analyzeCompany } from "@/lib/runtime/company-analysis";
import { id } from "@/lib/ids";
export const maxDuration=60;
export async function POST(request:Request) {
 return withWorkspaceRequest(request,async()=>{
  const parsed=z.object({description:z.string().trim().max(6000).optional(),website:z.string().trim().max(2000).optional()}).refine(v=>!!v.website || (v.description?.length ?? 0)>=20).safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return Response.json({error:"Provide a public website or at least 20 characters about your company."},{status:400});
  if(!providerStatus().configured)return Response.json({error:"Connect an AI provider to prepare your profile. You can also fill it in directly."},{status:503});
  const recent=getStore().outbox.filter(e=>e.type==="company.analysis" && Date.parse(e.createdAt)>Date.now()-3600000);
  if(recent.length>=6)return Response.json({error:"Hourly analysis limit reached. Edit your profile directly or try again later."},{status:429});
  mutateStore(s=>s.outbox.push({id:id("evt"),tenantId:s.workspace.tenantId,type:"company.analysis",payload:{},createdAt:new Date().toISOString()}));
  try{return Response.json(await analyzeCompany(parsed.data));}
  catch{return Response.json({error:"Could not prepare a grounded profile. Check the website or describe your business directly.",retryable:true});}
 });
}
