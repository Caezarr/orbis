import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

async function main() {
  const connectionString = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error("MIGRATION_DATABASE_URL or DATABASE_URL required");
  const db = new Pool({ connectionString, max: 1 });
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('orbis-migrations',0))");
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())");
    const directory = path.join(process.cwd(), "migrations");
    for (const name of (await readdir(directory)).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
      const sql = await readFile(path.join(directory, name), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const previous = await client.query("SELECT checksum FROM schema_migrations WHERE name=$1", [name]);
      if (previous.rows.length) {
        if (previous.rows[0].checksum !== checksum) throw new Error(`Applied migration changed: ${name}`);
        continue;
      }
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)", [name, checksum]);
      console.log(`Applied ${name}`);
    }
    // Optional runtime role grant: schema identifier quoted, never interpolated raw.
    const role = process.env.DATABASE_APP_ROLE;
    if (role) {
      const quoted = '"' + role.replaceAll('"', '""') + '"';
      await client.query(`GRANT USAGE ON SCHEMA public TO ${quoted}`);
      await client.query(`GRANT SELECT, INSERT ON workspaces, memberships TO ${quoted}`);
      await client.query(`GRANT SELECT, INSERT, UPDATE ON workspace_state TO ${quoted}`);
      for (const table of ["stripe_customers", "stripe_subscriptions", "stripe_events", "stripe_checkout_attempts", "operational_tasks", "operational_acceptances", "product_events", "task_effort"]) {
        const exists = await client.query("SELECT to_regclass($1) AS relation", [`public.${table}`]);
        if (exists.rows[0].relation) await client.query(`GRANT SELECT, INSERT, UPDATE ON ${table} TO ${quoted}`);
      }
    }
    await client.query("COMMIT");
    console.log("Migrations complete");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); await db.end(); }
}
main().catch(() => { console.error("Migration failed; verify connectivity, privileges, migration checksums and SQL."); process.exitCode = 1; });
