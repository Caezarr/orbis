import {withWorkspaceRequest} from "@/lib/platform/request";
import {isOfflineMode} from "@/lib/platform/context";
import {enqueueSchema} from "@/lib/operations/domain";
import {enqueue,listTasks,quoteFor} from "@/lib/operations/service";
export async function GET(request:Request){return withWorkspaceRequest(request,async()=>{
 if(isOfflineMode())return Response.json({tasks:[],contributionEvents:[],mode:"offline"});
 const url=new URL(request.url);
 if(url.searchParams.has("missionId"))return Response.json({quote:quoteFor(url.searchParams.get("missionId")??"",url.searchParams.get("workflowId")??"")});
 return Response.json(await listTasks());
});}
export async function POST(request:Request){return withWorkspaceRequest(request,async()=>{
 if(process.env.ORBIS_OPERATIONS_ENABLED!=="true")return Response.json({error:"Task execution is not enabled for this deployment."},{status:503});
 const parsed=enqueueSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return Response.json({error:"Review the mission, input and quoted task price."},{status:400});
 return Response.json(await enqueue(parsed.data,request.headers.get("Idempotency-Key")??""),{status:201});
},{requireRole:["owner","admin","operator"]});}
