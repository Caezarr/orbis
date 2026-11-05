import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), role: "owner" }));
vi.mock("@/lib/platform/context", () => ({
  workspaceContext: () => ({
    db: { query: mocks.query },
    tenantId: "tenant",
    workspaceId: "workspace",
    userId: "user",
    role: mocks.role,
  }),
}));
import { requestAction } from "./service";

const row = { id: "item", status: "nouveau", kind: "quote_request", contact_erased_at: new Date(), thread_id: "th", provider: "gmail", drafts: 0, followups: [] };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.role = "owner";
  mocks.query.mockResolvedValue({ rows: [row], rowCount: 1 });
});
const calls = () => mocks.query.mock.calls.map(([sql, params]) => ({ sql: String(sql), params }));

describe("erase_contact", () => {
  it("also clears the thread's reply and regeneration previews, scoped to the item's workspace", async () => {
    await requestAction("item", { action: "erase_contact" });
    const inbox = calls().find((c) => c.sql.startsWith("UPDATE inbox_messages"));
    const regen = calls().find((c) => c.sql.startsWith("UPDATE brain_jobs"));
    expect(inbox?.sql).toContain("subject_preview=NULL, draft_preview=NULL, questions='[]'::jsonb");
    expect(inbox?.sql).toContain("m.connected_account_id=i.connected_account_id AND m.thread_id=i.thread_id");
    expect(regen?.sql).toContain("draft_preview=NULL");
    expect(regen?.sql).toContain("j.inbox_message_id=m.id");
    for (const c of [inbox, regen]) {
      expect(c?.sql).toContain("i.id=$1 AND i.workspace_id=$2 AND i.tenant_id=$3");
      expect(c?.params).toEqual(["item", "workspace", "tenant"]);
    }
  });
  it("leaves previews alone for other actions", async () => {
    await requestAction("item", { action: "won" });
    expect(calls().some((c) => /UPDATE (inbox_messages|brain_jobs)/.test(c.sql))).toBe(false);
  });
  it("stays owner/admin only", async () => {
    mocks.role = "operator";
    await expect(requestAction("item", { action: "erase_contact" })).rejects.toThrow(/propriétaire/);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
