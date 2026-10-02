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
      // Inbox drafts (migration 007): rows of tenant B are invisible and immutable to A.
      if ((await db.query("SELECT to_regclass('public.inbox_batches') AS r")).rows[0].r) {
        await setTenantContext(db, { userId: ids[1], tenantId: ids[1], workspaceId: ids[1] });
        await db.query("INSERT INTO inbox_batches(id,workspace_id,tenant_id,created_by,request_key,request_hash,provider,connected_account_id,mission_version,mode,window_days,max_messages,max_drafts) VALUES($1,$1,$1,$1,'k','h','gmail','acc','v','test',14,50,5)", [ids[1]]);
        await db.query("INSERT INTO inbox_messages(id,workspace_id,tenant_id,batch_id,provider,connected_account_id,message_id,thread_id,mission_version,content_hash,status) VALUES($1,$1,$1,$1,'gmail','acc','m','t','v','h','seen')", [ids[1]]);
        await setTenantContext(db, { userId: ids[0], tenantId: ids[0], workspaceId: ids[0] });
        for (const table of ["inbox_batches", "inbox_messages"]) {
          assert.equal((await db.query(`SELECT * FROM ${table} WHERE tenant_id=$1`, [ids[1]])).rowCount, 0, table);
          assert.equal((await db.query(`UPDATE ${table} SET tenant_id=tenant_id WHERE tenant_id=$1`, [ids[1]])).rowCount, 0, table);
        }
        // Inbox scheduler (migration 008): settings/visits isolation + dispatcher privilege model.
        if ((await db.query("SELECT to_regclass('public.inbox_settings') AS r")).rows[0].r) {
          await setTenantContext(db, { userId: ids[1], tenantId: ids[1], workspaceId: ids[1] });
          await db.query("INSERT INTO inbox_settings(workspace_id,tenant_id,continuous_enabled,provider,connected_account_id,next_run_at) VALUES($1,$1,true,'gmail','acc',now())", [ids[1]]);
          await db.query("INSERT INTO inbox_visits(workspace_id,tenant_id,user_id) VALUES($1,$1,$1)", [ids[1]]);
          await setTenantContext(db, { userId: ids[0], tenantId: ids[0], workspaceId: ids[0] });
          for (const table of ["inbox_settings", "inbox_visits"]) {
            assert.equal((await db.query(`SELECT * FROM ${table} WHERE tenant_id=$1`, [ids[1]])).rowCount, 0, table);
            // inbox_settings grants UPDATE on scheduling columns only (never ids or the cap).
            const column = table === "inbox_settings" ? "updated_at" : "seen_at";
            assert.equal((await db.query(`UPDATE ${table} SET ${column}=${column} WHERE tenant_id=$1`, [ids[1]])).rowCount, 0, table);
          }
          await setTenantContext(db, { userId: ids[0], tenantId: ids[1], workspaceId: ids[1] });
          assert.equal((await db.query("SELECT * FROM inbox_settings WHERE tenant_id=$1", [ids[1]])).rowCount, 0, "non-member settings");
          // A member cannot write a visit marker for another user.
          await setTenantContext(db, { userId: ids[0], tenantId: ids[0], workspaceId: ids[0] });
          await db.query("SAVEPOINT visit_forgery");
          await assert.rejects(db.query("INSERT INTO inbox_visits(workspace_id,tenant_id,user_id) VALUES($1,$1,$2)", [ids[0], ids[1]]), Error, "visit for another user");
          await db.query("ROLLBACK TO SAVEPOINT visit_forgery");
          // Runtime role can never raise its own cap.
          assert.equal((await db.query("SELECT has_column_privilege(current_user,'inbox_settings','monthly_cap_cents','UPDATE') AS p")).rows[0].p, false, "runtime role must not UPDATE monthly_cap_cents");
          assert.equal((await db.query("SELECT has_table_privilege(current_user,'inbox_settings','DELETE') AS p")).rows[0].p, false, "no DELETE on inbox_settings");
          // Dispatcher role: NOLOGIN, no BYPASSRLS, not reachable from the runtime role.
          const dispatch = (await db.query("SELECT rolcanlogin,rolbypassrls,rolsuper FROM pg_roles WHERE rolname='orbis_inbox_dispatch'")).rows[0];
          assert.deepEqual(dispatch, { rolcanlogin: false, rolbypassrls: false, rolsuper: false }, "dispatch role attributes");
          assert.equal((await db.query("SELECT pg_has_role(current_user,'orbis_inbox_dispatch','MEMBER') AS m")).rows[0].m, false, "runtime role must not be a member of orbis_inbox_dispatch");
          await db.query("SAVEPOINT set_role");
          await assert.rejects(db.query("SET LOCAL ROLE orbis_inbox_dispatch"), Error, "runtime cannot assume dispatch role");
          await db.query("ROLLBACK TO SAVEPOINT set_role");
          assert.equal((await db.query("SELECT has_function_privilege(current_user,'orbis_set_workspace_inbox_cap(text,integer)','EXECUTE') AS p")).rows[0].p, false, "runtime role must not set caps");
          const capAdmin = (await db.query("SELECT rolcanlogin,rolbypassrls,rolsuper FROM pg_roles WHERE rolname='orbis_inbox_cap_admin'")).rows[0];
          assert.deepEqual(capAdmin, { rolcanlogin: false, rolbypassrls: false, rolsuper: false }, "cap admin role attributes");
          assert.equal((await db.query("SELECT pg_has_role(current_user,'orbis_inbox_cap_admin','MEMBER') AS m")).rows[0].m, false, "runtime role must not be a member of orbis_inbox_cap_admin");
          for (const column of ["cursor_at", "connected_account_id", "continuous_enabled"])
            assert.equal((await db.query("SELECT has_column_privilege('orbis_inbox_cap_admin','inbox_settings',$1,'SELECT') AS p", [column])).rows[0].p, false, `cap admin must not read ${column}`);
          const fn = (await db.query("SELECT pg_get_userbyid(p.proowner) AS owner, p.prosecdef, p.proconfig FROM pg_proc p WHERE p.proname='orbis_inbox_due_workspaces'")).rows[0];
          assert.equal(fn.owner, "orbis_inbox_dispatch");
          assert.equal(fn.prosecdef, true);
          assert.ok((fn.proconfig ?? []).some((c: string) => c.startsWith("search_path=")), "definer function pins search_path");
          // Column-level least privilege: scheduling columns only, read-only.
          for (const [table, column] of [["inbox_messages", "draft_preview"], ["inbox_messages", "subject_preview"], ["inbox_messages", "message_id"], ["inbox_batches", "stats"], ["inbox_batches", "connected_account_id"], ["inbox_batches", "error"], ["inbox_settings", "cursor_at"], ["inbox_settings", "connected_account_id"], ["inbox_settings", "monthly_cap_cents"], ["workspace_state", "state"], ["memberships", "email"], ["memberships", "name"], ["workspaces", "name"]])
            assert.equal((await db.query("SELECT has_column_privilege('orbis_inbox_dispatch',$1,$2,'SELECT') AS p", [table, column])).rows[0].p, false, `dispatch must not read ${table}.${column}`);
          for (const table of ["inbox_batches", "inbox_messages", "inbox_settings", "inbox_visits", "memberships", "workspace_state", "workspaces"])
            for (const privilege of ["INSERT", "UPDATE", "DELETE"])
              assert.equal((await db.query("SELECT has_table_privilege('orbis_inbox_dispatch',$1,$2) AS p", [table, privilege])).rows[0].p, false, `dispatch must not ${privilege} ${table}`);
          // Discovery works across tenants (ids only) while content stays invisible.
          await setTenantContext(db, { userId: ids[0], tenantId: ids[0], workspaceId: ids[0] });
          const due = await db.query("SELECT * FROM orbis_inbox_due_workspaces(200)");
          assert.deepEqual(due.fields.map(f => f.name), ["tenant_id", "workspace_id", "worker_user_id", "due_batches", "poll_due", "due_since"], "discovery returns ids only");
          const found = due.rows.find(r => r.workspace_id === ids[1]);
          assert.ok(found || due.rowCount === 200, "tenant B due work discovered");
          if (found) assert.deepEqual([found.tenant_id, found.worker_user_id, found.poll_due], [ids[1], ids[1], true]);
          assert.equal((await db.query("SELECT * FROM inbox_batches WHERE tenant_id=$1", [ids[1]])).rowCount, 0, "discovery grants no content access");
          // Trial + subscription plans (migration 010).
          if ((await db.query("SELECT to_regclass('public.billing_trials') AS r")).rows[0].r) {
            await setTenantContext(db, { userId: ids[1], tenantId: ids[1], workspaceId: ids[1] });
            await db.query("INSERT INTO billing_trials(workspace_id,tenant_id,started_at,ends_at,draft_limit,config_version) VALUES($1,$1,now(),now()+interval '14 days',50,'check')", [ids[1]]);
            assert.equal((await db.query("INSERT INTO billing_trials(workspace_id,tenant_id,started_at,ends_at,draft_limit,config_version) VALUES($1,$1,now(),now()+interval '90 days',500,'check') ON CONFLICT(workspace_id) DO NOTHING", [ids[1]])).rowCount, 0, "a trial cannot be restarted");
            await db.query("UPDATE inbox_batches SET status='quota_reached',completed_at=now() WHERE id=$1", [ids[1]]);
            await setTenantContext(db, { userId: ids[0], tenantId: ids[0], workspaceId: ids[0] });
            assert.equal((await db.query("SELECT * FROM billing_trials WHERE tenant_id=$1", [ids[1]])).rowCount, 0, "billing_trials isolation");
            for (const privilege of ["UPDATE", "DELETE"])
              assert.equal((await db.query("SELECT has_table_privilege(current_user,'billing_trials',$1) AS p", [privilege])).rows[0].p, false, `runtime must not ${privilege} billing_trials`);
            for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"])
              assert.equal((await db.query("SELECT has_table_privilege(current_user,'billing_plan_caps',$1) AS p", [privilege])).rows[0].p, false, `runtime must not ${privilege} billing_plan_caps`);
            assert.equal((await db.query("SELECT has_function_privilege(current_user,'orbis_sync_workspace_plan_cap(text,text,integer)','EXECUTE') AS p")).rows[0].p, true, "runtime syncs plan caps through the definer function");
            const sync = (await db.query("SELECT pg_get_userbyid(p.proowner) AS owner, p.prosecdef, p.proconfig FROM pg_proc p WHERE p.proname='orbis_sync_workspace_plan_cap'")).rows[0];
            assert.equal(sync.owner, "orbis_inbox_cap_admin");
            assert.equal(sync.prosecdef, true);
            assert.ok((sync.proconfig ?? []).some((c: string) => c.startsWith("search_path=")), "sync function pins search_path");
            assert.equal((await db.query("SELECT has_column_privilege('orbis_inbox_cap_admin','stripe_subscriptions','stripe_customer_id','SELECT') AS p")).rows[0].p, false, "cap admin reads plan/status only");
            // Clamped to the operator ceiling, whatever the runtime asks for.
            const ceiling = Number((await db.query("SELECT orbis_sync_workspace_plan_cap($1,'trial',2000000000) AS cap", [ids[1]])).rows[0].cap);
            assert.ok(ceiling > 0 && ceiling < 2000000000, "trial cap clamped to its ceiling");
            await db.query("SAVEPOINT paid_cap");
            await assert.rejects(db.query("SELECT orbis_sync_workspace_plan_cap($1,'equipe',100)", [ids[1]]), Error, "paid cap without a synced subscription");
            await db.query("ROLLBACK TO SAVEPOINT paid_cap");
            assert.equal(Number((await db.query("SELECT orbis_sync_workspace_plan_cap($1,'none',5000) AS cap", [ids[1]])).rows[0].cap), 0, "no plan = cap 0");
            await setTenantContext(db, { userId: ids[1], tenantId: ids[1], workspaceId: ids[1] });
            assert.equal((await db.query("SELECT monthly_cap_cents FROM inbox_settings WHERE workspace_id=$1", [ids[1]])).rows[0].monthly_cap_cents, 0, "cap applied to the tenant's own workspace");
            await setTenantContext(db, { userId: ids[0], tenantId: ids[0], workspaceId: ids[0] });
          }
        }
        await setTenantContext(db, { userId: ids[0], tenantId: ids[1], workspaceId: ids[1] });
        assert.equal((await db.query("SELECT * FROM inbox_messages WHERE tenant_id=$1", [ids[1]])).rowCount, 0, "non-member");
        await assert.rejects(db.query("INSERT INTO inbox_batches(id,workspace_id,tenant_id,created_by,request_key,request_hash,provider,connected_account_id,mission_version,mode,window_days,max_messages,max_drafts) VALUES($1,$2,$2,$1,'k2','h','gmail','acc','v','test',14,50,5)", [randomUUID(), ids[1]]));
      }
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  finally { await pool().end(); }
  console.log("PASS: PostgreSQL RLS blocks cross-tenant reads/writes (incl. inbox tables, scheduler settings/visits, ids-only dispatcher role); plan trials/caps (010); test rows rolled back");
}
checks().then(async () => {
  if (process.argv.includes("--database")) await databaseChecks();
  else console.log("SKIP: live PostgreSQL RLS (run with --database and a migrated non-BYPASSRLS DATABASE_URL)");
}).catch(error => { console.error(error instanceof Error ? error.message : "Platform check failed"); process.exitCode = 1; });
