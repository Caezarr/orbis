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
        // Company brain (migration 009): facts, questions, outcomes, usage, jobs isolated per tenant.
        if ((await db.query("SELECT to_regclass('public.brain_facts') AS r")).rows[0].r) {
          const brainTables = ["brain_jobs", "brain_sent_messages", "brain_facts", "brain_questions", "brain_question_messages", "brain_draft_outcomes", "brain_usage"];
          await setTenantContext(db, { userId: ids[1], tenantId: ids[1], workspaceId: ids[1] });
          await db.query("INSERT INTO brain_jobs(id,workspace_id,tenant_id,created_by,request_key,kind,provider,connected_account_id,mode) VALUES($1,$1,$1,$1,'k','extract_sent','gmail','acc','test')", [ids[1]]);
          await db.query("INSERT INTO brain_sent_messages(id,workspace_id,tenant_id,job_id,connected_account_id,message_id,content_hash,status) VALUES($1,$1,$1,$1,'acc','m','h','processed')", [ids[1]]);
          await db.query("INSERT INTO brain_facts(id,workspace_id,tenant_id,category,topic_key,statement,status,origin,quotes) VALUES($1,$1,$1,'pricing','prix','Pose : 45 € HT/m²','candidate','sent_mail','[{\"quote\":\"45 € HT/m²\",\"messageId\":\"m\",\"sentAt\":\"2026-09-01T00:00:00Z\"}]'::jsonb)", [ids[1]]);
          await db.query("INSERT INTO brain_questions(id,workspace_id,tenant_id,canonical_key,label) VALUES($1,$1,$1,'m2 pose prix','prix de la pose au m²')", [ids[1]]);
          await db.query("INSERT INTO brain_question_messages(workspace_id,tenant_id,question_id,inbox_message_id) VALUES($1,$1,$1,$1)", [ids[1]]);
          await db.query("INSERT INTO brain_draft_outcomes(id,workspace_id,tenant_id,inbox_message_id,outcome) VALUES($1,$1,$1,$1,'sent_edited')", [ids[1]]);
          await db.query("INSERT INTO brain_usage(id,workspace_id,tenant_id,kind,ref_id,est_cost_cents) VALUES($1,$1,$1,'extract',$1,3)", [ids[1]]);
          // A fact can never be approved without a human reviewer (CHECK).
          await db.query("SAVEPOINT unreviewed");
          await assert.rejects(db.query("UPDATE brain_facts SET status='approved' WHERE id=$1", [ids[1]]), Error, "approval requires reviewed_by");
          await db.query("ROLLBACK TO SAVEPOINT unreviewed");
          await setTenantContext(db, { userId: ids[0], tenantId: ids[0], workspaceId: ids[0] });
          for (const table of brainTables) {
            assert.equal((await db.query(`SELECT * FROM ${table} WHERE tenant_id=$1`, [ids[1]])).rowCount, 0, table);
            assert.equal((await db.query(`UPDATE ${table} SET tenant_id=tenant_id WHERE tenant_id=$1`, [ids[1]])).rowCount, 0, table);
            assert.equal((await db.query("SELECT has_table_privilege(current_user,$1,'DELETE') AS p", [table])).rows[0].p, false, `no DELETE on ${table}`);
          }
          // Budget sums only see the session tenant's usage.
          assert.equal((await db.query("SELECT COALESCE(sum(est_cost_cents),0)::int AS c FROM brain_usage WHERE workspace_id=$1", [ids[1]])).rows[0].c, 0, "cross-tenant usage invisible");
          await setTenantContext(db, { userId: ids[0], tenantId: ids[1], workspaceId: ids[1] });
          assert.equal((await db.query("SELECT * FROM brain_facts WHERE tenant_id=$1", [ids[1]])).rowCount, 0, "non-member facts");
          await db.query("SAVEPOINT brain_forgery");
          await assert.rejects(db.query("INSERT INTO brain_facts(id,workspace_id,tenant_id,category,topic_key,statement,status,origin) VALUES($1,$2,$2,'other','x','forged','candidate','sent_mail')", [randomUUID(), ids[1]]), Error, "non-member cannot write facts");
          await db.query("ROLLBACK TO SAVEPOINT brain_forgery");
          // Dispatcher: brain_jobs scheduling columns only; ids-only discovery.
          for (const [table, column] of [["brain_jobs", "stats"], ["brain_jobs", "error"], ["brain_jobs", "draft_preview"], ["brain_jobs", "connected_account_id"], ["brain_facts", "statement"], ["brain_facts", "quotes"], ["brain_questions", "label"], ["brain_usage", "est_cost_cents"]])
            assert.equal((await db.query("SELECT has_column_privilege('orbis_inbox_dispatch',$1,$2,'SELECT') AS p", [table, column])).rows[0].p, false, `dispatch must not read ${table}.${column}`);
          for (const table of brainTables)
            for (const privilege of ["INSERT", "UPDATE", "DELETE"])
              assert.equal((await db.query("SELECT has_table_privilege('orbis_inbox_dispatch',$1,$2) AS p", [table, privilege])).rows[0].p, false, `dispatch must not ${privilege} ${table}`);
          const brainFn = (await db.query("SELECT pg_get_userbyid(p.proowner) AS owner, p.prosecdef, p.proconfig FROM pg_proc p WHERE p.proname='orbis_brain_due_workspaces'")).rows[0];
          assert.equal(brainFn.owner, "orbis_inbox_dispatch");
          assert.equal(brainFn.prosecdef, true);
          assert.ok((brainFn.proconfig ?? []).some((c: string) => c.startsWith("search_path=")), "brain definer function pins search_path");
          await setTenantContext(db, { userId: ids[0], tenantId: ids[0], workspaceId: ids[0] });
          const brainDue = await db.query("SELECT * FROM orbis_brain_due_workspaces(200)");
          assert.deepEqual(brainDue.fields.map(f => f.name), ["tenant_id", "workspace_id", "worker_user_id", "due_jobs", "due_since"], "brain discovery returns ids only");
          const brainFound = brainDue.rows.find(r => r.workspace_id === ids[1]);
          assert.ok(brainFound || brainDue.rowCount === 200, "tenant B brain job discovered");
          assert.equal((await db.query("SELECT * FROM brain_jobs WHERE tenant_id=$1", [ids[1]])).rowCount, 0, "brain discovery grants no content access");
        }
        // Follow-ups + request pipeline (migration 011): isolated per tenant, no DELETE, no dispatcher access.
        if ((await db.query("SELECT to_regclass('public.pipeline_items') AS r")).rows[0].r) {
          const pipelineTables = ["pipeline_settings", "pipeline_items", "followups", "pipeline_usage"];
          await setTenantContext(db, { userId: ids[1], tenantId: ids[1], workspaceId: ids[1] });
          await db.query("INSERT INTO pipeline_settings(workspace_id,tenant_id,followup_business_days) VALUES($1,$1,5)", [ids[1]]);
          await db.query("INSERT INTO pipeline_items(id,workspace_id,tenant_id,provider,connected_account_id,thread_id,first_message_row_id,kind,contact_name,contact_email,contact_domain,first_customer_at) VALUES($1,$1,$1,'gmail','acc','t1',$1,'quote_request','Claire','claire@client.test','client.test',now())", [ids[1]]);
          await db.query("INSERT INTO followups(id,workspace_id,tenant_id,pipeline_item_id,stage,owner_message_at,due_at) VALUES($1,$1,$1,$1,1,now(),now())", [ids[1]]);
          await db.query("INSERT INTO pipeline_usage(id,workspace_id,tenant_id,kind,ref_id,est_cost_cents) VALUES($1,$1,$1,'followup_draft',$1,5)", [ids[1]]);
          // One follow-up per thread and stage; at most 2 stages; gagné/perdu need a human decision.
          for (const [label, sql] of [
            ["duplicate stage", "INSERT INTO followups(id,workspace_id,tenant_id,pipeline_item_id,stage,owner_message_at,due_at) VALUES(gen_random_uuid()::text,$1,$1,$1,1,now(),now())"],
            ["stage 3", "INSERT INTO followups(id,workspace_id,tenant_id,pipeline_item_id,stage,owner_message_at,due_at) VALUES(gen_random_uuid()::text,$1,$1,$1,3,now(),now())"],
            ["won without reviewer", "UPDATE pipeline_items SET status='gagne' WHERE id=$1"],
            ["erased contact kept", "UPDATE pipeline_items SET contact_erased_at=now() WHERE id=$1"],
          ] as const) {
            await db.query("SAVEPOINT pipeline_check");
            await assert.rejects(db.query(sql, [ids[1]]), Error, label);
            await db.query("ROLLBACK TO SAVEPOINT pipeline_check");
          }
          await setTenantContext(db, { userId: ids[0], tenantId: ids[0], workspaceId: ids[0] });
          for (const table of pipelineTables) {
            assert.equal((await db.query(`SELECT * FROM ${table} WHERE tenant_id=$1`, [ids[1]])).rowCount, 0, table);
            assert.equal((await db.query(`UPDATE ${table} SET tenant_id=tenant_id WHERE tenant_id=$1`, [ids[1]])).rowCount, 0, table);
            assert.equal((await db.query("SELECT has_table_privilege(current_user,$1,'DELETE') AS p", [table])).rows[0].p, false, `no DELETE on ${table}`);
            for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"])
              assert.equal((await db.query("SELECT has_table_privilege('orbis_inbox_dispatch',$1,$2) AS p", [table, privilege])).rows[0].p, false, `dispatch must not ${privilege} ${table}`);
          }
          assert.equal((await db.query("SELECT COALESCE(sum(est_cost_cents),0)::int AS c FROM pipeline_usage WHERE workspace_id=$1", [ids[1]])).rows[0].c, 0, "cross-tenant pipeline usage invisible");
          await setTenantContext(db, { userId: ids[0], tenantId: ids[1], workspaceId: ids[1] });
          assert.equal((await db.query("SELECT * FROM pipeline_items WHERE tenant_id=$1", [ids[1]])).rowCount, 0, "non-member pipeline");
          await db.query("SAVEPOINT pipeline_forgery");
          await assert.rejects(db.query("INSERT INTO pipeline_items(id,workspace_id,tenant_id,provider,connected_account_id,thread_id,first_message_row_id,kind) VALUES($1,$2,$2,'gmail','acc','t2','r','customer_request')", [randomUUID(), ids[1]]), Error, "non-member cannot write pipeline items");
          await db.query("ROLLBACK TO SAVEPOINT pipeline_forgery");
          await setTenantContext(db, { userId: ids[0], tenantId: ids[0], workspaceId: ids[0] });
        }
        await setTenantContext(db, { userId: ids[0], tenantId: ids[1], workspaceId: ids[1] });
        assert.equal((await db.query("SELECT * FROM inbox_messages WHERE tenant_id=$1", [ids[1]])).rowCount, 0, "non-member");
        await db.query("SAVEPOINT batch_forgery");
        await assert.rejects(db.query("INSERT INTO inbox_batches(id,workspace_id,tenant_id,created_by,request_key,request_hash,provider,connected_account_id,mission_version,mode,window_days,max_messages,max_drafts) VALUES($1,$2,$2,$1,'k2','h','gmail','acc','v','test',14,50,5)", [randomUUID(), ids[1]]));
        await db.query("ROLLBACK TO SAVEPOINT batch_forgery");
      }
      // Launch hardening (migration 012): shared limiter, retention purge, tenant erasure.
      if ((await db.query("SELECT to_regclass('public.rate_limit_counters') AS r")).rows[0].r) {
        await setTenantContext(db, { userId: ids[0], tenantId: ids[0], workspaceId: ids[0] });
        for (const role of ["orbis_rate_limiter", "orbis_tenant_eraser", "orbis_retention"]) {
          const attrs = (await db.query("SELECT rolcanlogin,rolbypassrls,rolsuper FROM pg_roles WHERE rolname=$1", [role])).rows[0];
          assert.deepEqual(attrs, { rolcanlogin: false, rolbypassrls: false, rolsuper: false }, `${role} attributes`);
          assert.equal((await db.query("SELECT pg_has_role(current_user,$1,'MEMBER') AS m", [role])).rows[0].m, false, `runtime role must not be a member of ${role}`);
        }
        for (const table of ["rate_limit_counters", "tenant_erasures"])
          for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"])
            assert.equal((await db.query("SELECT has_table_privilege(current_user,$1,$2) AS p", [table, privilege])).rows[0].p, false, `runtime must not ${privilege} ${table}`);
        for (const [fn, owner] of [["orbis_rate_limit_take", "orbis_rate_limiter"], ["orbis_budget_reserve", "orbis_rate_limiter"], ["orbis_rate_limit_purge", "orbis_rate_limiter"], ["orbis_erase_tenant", "orbis_tenant_eraser"], ["orbis_retention_purge", "orbis_retention"]]) {
          const row = (await db.query("SELECT pg_get_userbyid(p.proowner) AS owner, p.prosecdef, p.proconfig FROM pg_proc p WHERE p.proname=$1", [fn])).rows[0];
          assert.equal(row.owner, owner, `${fn} owner`);
          assert.equal(row.prosecdef, true, `${fn} security definer`);
          assert.ok((row.proconfig ?? []).some((c: string) => c.startsWith("search_path=")), `${fn} pins search_path`);
        }
        // Eraser: DELETE but no content columns; never DELETE outside the erasure setting.
        for (const [table, column] of [["inbox_messages", "draft_preview"], ["pipeline_items", "contact_email"], ["memberships", "email"], ["workspace_state", "state"], ["brain_facts", "statement"]])
          if ((await db.query("SELECT to_regclass($1) AS r", [`public.${table}`])).rows[0].r)
            assert.equal((await db.query("SELECT has_column_privilege('orbis_tenant_eraser',$1,$2,'SELECT') AS p", [table, column])).rows[0].p, false, `eraser must not read ${table}.${column}`);
        assert.equal((await db.query("SELECT has_column_privilege('orbis_retention','memberships','email','SELECT') AS p")).rows[0].p, false, "retention must not read emails");
        // Shared limiter: atomic counters across callers, hashed keys only.
        const key = "a".repeat(64), other = "b".repeat(64);
        const take = async (k: string) => (await db.query("SELECT allowed FROM orbis_rate_limit_take('check_platform',$1,60,2,1)", [k])).rows[0].allowed;
        assert.deepEqual([await take(key), await take(key), await take(key), await take(other)], [true, true, false, true], "fixed-window limit per key");
        await db.query("SAVEPOINT raw_key");
        await assert.rejects(db.query("SELECT * FROM orbis_rate_limit_take('check_platform','203.0.113.7',60,2,1)"), Error, "raw IP keys are refused");
        await db.query("ROLLBACK TO SAVEPOINT raw_key");
        const reserve = async (k: string) => (await db.query("SELECT orbis_budget_reserve('check_budget',$1,15,30,40) AS r", [k])).rows[0].r;
        assert.deepEqual([await reserve(key), await reserve(key), await reserve(other)], ["ok", "ok", "global"], "budget global cap");
        // Retention purge: expired previews and contacts of ANY tenant, nothing else.
        await setTenantContext(db, { userId: ids[1], tenantId: ids[1], workspaceId: ids[1] });
        await db.query("UPDATE inbox_messages SET subject_preview='Devis', draft_preview='Bonjour', purge_after=now()-interval '1 day' WHERE id=$1", [ids[1]]);
        const pipelineRows = !!(await db.query("SELECT to_regclass('public.pipeline_items') AS r")).rows[0].r;
        if (pipelineRows) await db.query("UPDATE pipeline_items SET purge_after=now()-interval '1 day' WHERE id=$1", [ids[1]]);
        await setTenantContext(db, { userId: ids[0], tenantId: ids[0], workspaceId: ids[0] });
        const purged = (await db.query("SELECT orbis_retention_purge() AS r")).rows[0].r;
        assert.ok(purged.inbox_previews >= 1, "expired inbox previews purged");
        await setTenantContext(db, { userId: ids[1], tenantId: ids[1], workspaceId: ids[1] });
        assert.deepEqual((await db.query("SELECT subject_preview, draft_preview FROM inbox_messages WHERE id=$1", [ids[1]])).rows[0], { subject_preview: null, draft_preview: null });
        if (pipelineRows) {
          const item = (await db.query("SELECT contact_email, contact_erased_at FROM pipeline_items WHERE id=$1", [ids[1]])).rows[0];
          assert.equal(item.contact_email, null, "expired contact purged");
          assert.ok(item.contact_erased_at, "erasure timestamp set");
        }
        // Tenant erasure: deleting tenant B leaves tenant A intact.
        await db.query("INSERT INTO stripe_customers(tenant_id,stripe_customer_id) VALUES($1,$2),($3,$4)", [ids[0], `cus_${ids[0]}`, ids[1], `cus_${ids[1]}`]);
        for (const [label, ctx, args] of [
          ["another tenant's owner", { userId: ids[0], tenantId: ids[0], workspaceId: ids[0] }, [ids[1], ids[1], `erase:${ids[1]}`]],
          ["non-member context", { userId: ids[0], tenantId: ids[1], workspaceId: ids[1] }, [ids[1], ids[1], `erase:${ids[1]}`]],
          ["wrong confirmation", { userId: ids[1], tenantId: ids[1], workspaceId: ids[1] }, [ids[1], ids[1], "erase:other"]],
          ["no context", { userId: "", tenantId: "", workspaceId: "" }, [ids[1], ids[1], `erase:${ids[1]}`]],
        ] as const) {
          await setTenantContext(db, ctx);
          await db.query("SAVEPOINT erase_refused");
          await assert.rejects(db.query("SELECT orbis_erase_tenant($1,$2,$3)", [...args]), Error, `erasure refused: ${label}`);
          await db.query("ROLLBACK TO SAVEPOINT erase_refused");
        }
        await setTenantContext(db, { userId: ids[1], tenantId: ids[1], workspaceId: ids[1] });
        const counts = (await db.query("SELECT orbis_erase_tenant($1,$1,$2) AS c", [ids[1], `erase:${ids[1]}`])).rows[0].c;
        for (const table of ["workspaces", "memberships", "workspace_state", "inbox_batches", "inbox_messages", "stripe_customers"])
          assert.ok(counts[table] >= 1, `tenant B rows erased from ${table}`);
        if ((await db.query("SELECT to_regclass('public.brain_facts') AS r")).rows[0].r)
          for (const table of ["brain_facts", "brain_jobs", "brain_usage"]) assert.ok(counts[table] >= 1, `tenant B rows erased from ${table}`);
        if (pipelineRows) for (const table of ["pipeline_items", "followups", "pipeline_usage"]) assert.ok(counts[table] >= 1, `tenant B rows erased from ${table}`);
        assert.equal((await db.query("SELECT count(*)::int AS n FROM stripe_customers WHERE tenant_id=$1", [ids[1]])).rows[0].n, 0, "tenant B billing rows gone");
        assert.equal((await db.query("SELECT count(*)::int AS n FROM stripe_customers WHERE tenant_id=$1", [ids[0]])).rows[0].n, 1, "tenant A billing rows intact");
        await setTenantContext(db, { userId: ids[0], tenantId: ids[0], workspaceId: ids[0] });
        assert.equal((await db.query("SELECT * FROM workspace_state WHERE workspace_id=$1", [ids[0]])).rowCount, 1, "tenant A snapshot intact");
        assert.equal((await db.query("SELECT * FROM memberships WHERE user_id=$1", [ids[0]])).rowCount, 1, "tenant A membership intact");
        assert.equal((await db.query("SELECT * FROM workspaces WHERE id=$1", [ids[0]])).rowCount, 1, "tenant A workspace intact");
      }
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  finally { await pool().end(); }
  console.log("PASS: PostgreSQL RLS blocks cross-tenant reads/writes (incl. inbox tables, scheduler settings/visits, company brain tables, follow-ups/pipeline tables, ids-only dispatcher role); plan trials/caps (010); shared limiter, retention purge and single-tenant erasure (012); test rows rolled back");
}
checks().then(async () => {
  if (process.argv.includes("--database")) await databaseChecks();
  else console.log("SKIP: live PostgreSQL RLS (run with --database and a migrated non-BYPASSRLS DATABASE_URL)");
}).catch(error => { console.error(error instanceof Error ? error.message : "Platform check failed"); process.exitCode = 1; });
