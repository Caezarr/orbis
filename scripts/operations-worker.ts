import {runOneTask} from "../src/lib/operations/worker";
import {pool} from "../src/lib/platform/db";
async function main(){
 const userId=process.env.ORBIS_WORKER_USER_ID,workspaceId=process.env.ORBIS_WORKER_WORKSPACE_ID,tenantId=process.env.ORBIS_WORKER_TENANT_ID;
 if(!userId||!workspaceId||!tenantId)throw new Error("Worker identity configuration required");
 // Invoke repeatedly from a supervisor. One bounded job per process, no hidden timer.
 console.log(await runOneTask({userId,workspaceId,tenantId}));
}
main().catch(()=>{console.error("Worker failed; check provider, database and workspace membership.");process.exitCode=1;}).finally(async()=>{if(process.env.DATABASE_URL)await pool().end();});
