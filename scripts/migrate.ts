import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

async function main() {
  const connectionString =
    process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString)
    throw new Error("MIGRATION_DATABASE_URL or DATABASE_URL required");
  const db = new Pool({ connectionString, max: 1 });
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('orbis-migrations',0))",
    );
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
    );
    const directory = path.join(process.cwd(), "migrations");
    for (const name of (await readdir(directory))
      .filter((name) => /^\d+.*\.sql$/.test(name))
      .sort()) {
      const sql = await readFile(path.join(directory, name), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const previous = await client.query(
        "SELECT checksum FROM schema_migrations WHERE name=$1",
        [name],
      );
      if (previous.rows.length) {
        if (previous.rows[0].checksum !== checksum)
          throw new Error(`Applied migration changed: ${name}`);
        continue;
      }
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)",
        [name, checksum],
      );
      console.log(`Applied ${name}`);
    }
    // Optional runtime role grant: schema identifier quoted, never interpolated raw.
    const role = process.env.DATABASE_APP_ROLE;
    if (role) {
      const quoted = '"' + role.replaceAll('"', '""') + '"';
      await client.query(`GRANT USAGE ON SCHEMA public TO ${quoted}`);
      await client.query(
        `GRANT SELECT, INSERT ON workspaces, memberships TO ${quoted}`,
      );
      await client.query(
        `GRANT SELECT, INSERT, UPDATE ON workspace_state TO ${quoted}`,
      );
      for (const table of [
        "stripe_customers",
        "stripe_subscriptions",
        "stripe_events",
        "stripe_checkout_attempts",
        "operational_tasks",
        "operational_acceptances",
        "product_events",
        "task_effort",
        "task_charges",
        "task_payment_batches",
        "inbox_batches",
        "inbox_messages",
      ]) {
        const exists = await client.query(
          "SELECT to_regclass($1) AS relation",
          [`public.${table}`],
        );
        if (exists.rows[0].relation)
          await client.query(
            `GRANT SELECT, INSERT, UPDATE ON ${table} TO ${quoted}`,
          );
      }
      // 008 inbox scheduler: column-scoped writes so the runtime role can never
      // raise its own monthly cap; discovery only through the definer function.
      const scheduler = await client.query(
        "SELECT to_regclass('public.inbox_settings') AS relation",
      );
      if (scheduler.rows[0].relation) {
        const writable =
          "continuous_enabled, provider, connected_account_id, interval_minutes, cursor_at, next_run_at, enabled_by, enabled_at, updated_at";
        await client.query(`GRANT SELECT ON inbox_settings TO ${quoted}`);
        await client.query(
          `GRANT INSERT (workspace_id, tenant_id, ${writable}) ON inbox_settings TO ${quoted}`,
        );
        await client.query(
          `GRANT UPDATE (${writable}) ON inbox_settings TO ${quoted}`,
        );
        await client.query(
          `GRANT SELECT, INSERT, UPDATE ON inbox_visits TO ${quoted}`,
        );
        // Only the function owner can grant EXECUTE: act as it for this one
        // statement (the migration owner holds SET, not INHERIT, on it).
        await client.query("SET LOCAL ROLE orbis_inbox_dispatch");
        await client.query(
          `GRANT EXECUTE ON FUNCTION orbis_inbox_due_workspaces(integer) TO ${quoted}`,
        );
        await client.query("RESET ROLE");
      }
    }
    await client.query("COMMIT");
    console.log("Migrations complete");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await db.end();
  }
}
main().catch(() => {
  console.error(
    "Migration failed; verify connectivity, privileges, migration checksums and SQL.",
  );
  process.exitCode = 1;
});
