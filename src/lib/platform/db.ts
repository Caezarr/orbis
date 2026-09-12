import { Pool, type PoolClient } from "pg";

let instance: Pool | undefined;
export function pool(): Pool {
  if (typeof window !== "undefined") throw new Error("Database is server-only");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  return instance ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 30_000,
  });
}
export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
export const withTransaction = transaction;
/** Transaction-local settings: never persist identity on a pooled connection. */
export async function setTenantContext(client: PoolClient, identity: {userId: string; tenantId?: string; workspaceId?: string}) {
  await client.query("SELECT set_config('app.user_id', $1, true), set_config('app.tenant_id', $2, true), set_config('app.workspace_id', $3, true)",
    [identity.userId, identity.tenantId ?? "", identity.workspaceId ?? ""]);
}
