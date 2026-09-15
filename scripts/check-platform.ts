import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { isOfflineMode, workspaceStorage, type WorkspaceContext } from "../src/lib/platform/context";
import { getStore, mutateStore, resetStore } from "../src/lib/store/store";
import { blankTenantState, withWorkspaceRequest } from "../src/lib/platform/request";
import { isSameOriginMutation, safeReturnTo } from "../src/lib/platform/auth";
import { pool, setTenantContext, transaction } from "../src/lib/platform/db";

function context(id: string): WorkspaceContext {
  return { workspaceId: id, tenantId: id, userId: id, role: "owner", state: blankTenantState({ id, tenantId: id, name: "Test", slug: id, createdAt: new Date().toISOString() }) };
}
async function checks() {
  const saved = { ...process.env };
  try {
    Object.assign(process.env, { NODE_ENV: "production" });
    process.env.ORBIS_OFFLINE = "true";
    process.env.ORBIS_OFFLINE_MODE = "true";
    delete process.env.DATABASE_URL;
    assert.equal(isOfflineMode(), false);
    assert.throws(() => getStore(), /context required/);
    assert.throws(() => resetStore(), /offline mode/);
    assert.throws(() => mutateStore(() => {}), /context required/);
    let called = false;
    const response = await withWorkspaceRequest(new Request("https://orbis.test/api/v1/workspace"), () => { called = true; return Response.json({}); });
    assert.equal(response.status, 503);
    assert.equal(called, false);
    process.env.APP_ORIGIN = "https://orbis.test";
    const blocked = await withWorkspaceRequest(new Request("https://orbis.test/api/v1/workspace", { method: "POST", headers: { origin: "https://attacker.test" } }), () => { throw new Error("must not run"); });
    assert.equal(blocked.status, 403);
    assert.equal(isSameOriginMutation(new Request("https://orbis.test/api", { method: "POST" })), false);
    assert.equal(isSameOriginMutation(new Request("https://orbis.test/api", { method: "POST", headers: { origin: "https://orbis.test" } })), true);
    for (const target of ["https://attacker.test", "//attacker.test", "/\\attacker.test", "/api/auth/sign-out", "/login", "/\n/attacker.test"]) assert.equal(safeReturnTo(target), "/today");
    assert.equal(safeReturnTo("/audit?website=https%3A%2F%2Fcompany.test"), "/audit?website=https%3A%2F%2Fcompany.test");
    const a = context("a"), b = context("b");
    await Promise.all([a, b].map(ctx => workspaceStorage.run(ctx, async () => {
      await Promise.resolve();
      mutateStore(state => { state.workspace.name = ctx.tenantId; });
      assert.equal(getStore().workspace.tenantId, ctx.tenantId);
      assert.equal(getStore().workspace.name, ctx.tenantId);
      assert.throws(() => mutateStore(state => { state.workspace.name = "leak"; throw new Error("abort"); }), /abort/);
      assert.equal(getStore().workspace.name, ctx.tenantId);
      ctx.readOnly = true;
      assert.throws(() => mutateStore(() => {}), /not writable/);
      ctx.closed = true;
      assert.throws(() => getStore(), /ended/);
    })));
    const blank = context("blank").state;
    for (const [key, value] of Object.entries(blank)) if (Array.isArray(value) && key !== "packages") assert.equal(value.length, 0, key);
    assert.equal(blank.profile, null);
    assert.ok(blank.packages.length);
    Object.assign(process.env, { NODE_ENV: "test" });
    delete process.env.VERCEL;
    assert.equal(isOfflineMode(), true);
    process.env.DATABASE_URL = "configured";
    assert.equal(isOfflineMode(), false);
    console.log("PASS: production fail-closed, CSRF, isolated contexts, rollback-on-throw, read-only/closed guards, blank tenants, explicit offline mode");
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
}

async function databaseChecks() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required for --database");
  const rollback = new Error("test rollback");
  try {
    await transaction(async db => {
      const role = (await db.query("SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user")).rows[0];
      assert.equal(role.rolsuper || role.rolbypassrls, false, "Runtime role must enforce RLS");
      const ids = [randomUUID(), randomUUID()];
      for (const id of ids) {
        await setTenantContext(db, { userId: id, tenantId: id, workspaceId: id });
        await db.query("INSERT INTO workspaces(id,tenant_id,name,slug,created_by) VALUES($1,$1,'Isolation test',$1,$1)", [id]);
        await db.query("INSERT INTO memberships(id,workspace_id,tenant_id,user_id,role) VALUES($1,$1,$1,$1,'owner')", [id]);
        await db.query("INSERT INTO workspace_state(workspace_id,tenant_id,state) VALUES($1,$1,$2::jsonb)", [id, JSON.stringify(context(id).state)]);
      }
      await setTenantContext(db, { userId: ids[0], tenantId: ids[1], workspaceId: ids[1] });
      assert.equal((await db.query("SELECT * FROM workspace_state WHERE workspace_id=$1", [ids[1]])).rowCount, 0);
      assert.equal((await db.query("UPDATE workspace_state SET version=version+1 WHERE workspace_id=$1", [ids[1]])).rowCount, 0);
      await setTenantContext(db, { userId: ids[0], tenantId: ids[0], workspaceId: ids[0] });
      assert.equal((await db.query("SELECT * FROM workspace_state WHERE workspace_id=$1 FOR UPDATE", [ids[0]])).rowCount, 1);
      assert.equal((await db.query("SELECT * FROM memberships WHERE user_id=$1", [ids[1]])).rowCount, 0);
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  finally { await pool().end(); }
  console.log("PASS: PostgreSQL RLS blocks cross-tenant reads/writes; test rows rolled back");
}
checks().then(async () => {
  if (process.argv.includes("--database")) await databaseChecks();
  else console.log("SKIP: live PostgreSQL RLS (run with --database and a migrated non-BYPASSRLS DATABASE_URL)");
}).catch(error => { console.error(error instanceof Error ? error.message : "Platform check failed"); process.exitCode = 1; });
