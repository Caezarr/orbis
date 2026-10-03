import {runOneTask} from "../src/lib/operations/worker";
import {inboxDraftsEnabled, runOneInboxBatch} from "../src/lib/operations/inbox-worker";
import {dispatchInboxPass} from "../src/lib/operations/dispatcher";
import {pool} from "../src/lib/platform/db";
async function main(){
 // Invoke repeatedly from a supervisor. One bounded job per type per process, no hidden timer.
 // ORBIS_WORKER_JOB=dispatch: one multi-tenant inbox pass over every workspace with due work
 // (same as GET /api/cron/inbox); no ORBIS_WORKER_*_ID identity needed.
 const job=process.env.ORBIS_WORKER_JOB??"all";
 if(job==="dispatch"){console.log(await dispatchInboxPass());return;}
 // ORBIS_WORKER_JOB=tasks|inbox|all (default all): single configured workspace identity.
 // Inbox batches also require ORBIS_INBOX_DRAFTS_ENABLED=true.
 const userId=process.env.ORBIS_WORKER_USER_ID,workspaceId=process.env.ORBIS_WORKER_WORKSPACE_ID,tenantId=process.env.ORBIS_WORKER_TENANT_ID;
 if(!userId||!workspaceId||!tenantId)throw new Error("Worker identity configuration required");
 const identity={userId,workspaceId,tenantId};
 if(job==="all"||job==="tasks")console.log(await runOneTask(identity));
 if((job==="all"||job==="inbox")&&inboxDraftsEnabled()){const r=await runOneInboxBatch(identity);console.log({processed:r.processed,batchId:"batchId" in r?r.batchId:undefined,stats:"stats" in r?r.stats:undefined});}
}
main().catch(()=>{console.error("Worker failed; check provider, database and workspace membership.");process.exitCode=1;}).finally(async()=>{if(process.env.DATABASE_URL)await pool().end();});
