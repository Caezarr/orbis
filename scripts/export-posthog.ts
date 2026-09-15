import { exportPosthog } from "../src/lib/analytics/export";
import { pool } from "../src/lib/platform/db";
async function main() {
  const userId = process.env.ORBIS_WORKER_USER_ID,
    workspaceId = process.env.ORBIS_WORKER_WORKSPACE_ID,
    tenantId = process.env.ORBIS_WORKER_TENANT_ID;
  if (!userId || !workspaceId || !tenantId)
    throw new Error("Worker workspace identity required");
  console.log(await exportPosthog({ userId, workspaceId, tenantId }));
}
main()
  .catch(() => {
    console.error(
      "PostHog export failed. Check configuration and membership; events remain queued.",
    );
    process.exitCode = 1;
  })
  .finally(() => pool().end());
