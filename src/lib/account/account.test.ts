import { describe, expect, it, vi } from "vitest";
import { deleteAuthIdentity } from "./auth-user";
import {
  cancelTenantSubscription,
  CONFIRMATION_WORD,
  eraseTenantRows,
  eraseWorkspace,
  EraseError,
  erasurePreconditions,
  type EraseDeps,
} from "./erase";
import { buildExportArchive, collectWorkspaceExport, csvCell, toCsv } from "./export";
import { runRetentionPurge } from "./retention";
import { crc32, createZip } from "./zip";
import { revokeWorkspaceConnections, type RevokeSdk } from "@/lib/integrations/action-broker";
import { integrationUser } from "@/lib/integrations/composio";

/** Tiny ZIP reader for tests: walks the central directory and checks CRCs. */
function readZip(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const files: Record<string, string> = {};
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 20, true);
    const nameLen = view.getUint16(at + 28, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.slice(at + 46, at + 46 + nameLen));
    expect(view.getUint32(local, true)).toBe(0x04034b50);
    const localNameLen = view.getUint16(local + 26, true);
    const data = bytes.slice(local + 30 + localNameLen, local + 30 + localNameLen + size);
    expect(crc32(data)).toBe(crc);
    files[name] = new TextDecoder().decode(data);
    at += 46 + nameLen;
  }
  return files;
}

describe("zip", () => {
  it("crc32 matches the reference value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
  it("writes a readable archive with UTF-8 content", () => {
    const files = readZip(createZip([{ name: "a.json", content: '{"é":1}' }, { name: "dir/b.csv", content: "x" }]));
    expect(files).toEqual({ "a.json": '{"é":1}', "dir/b.csv": "x" });
  });
  it("refuses path traversal names", () => {
    expect(() => createZip([{ name: "../etc/passwd", content: "" }])).toThrow();
    expect(() => createZip([{ name: "/abs", content: "" }])).toThrow();
  });
});

describe("export", () => {
  it("collects only existing tables, filtered by the session workspace", async () => {
    const queries: { sql: string; params: unknown[] }[] = [];
    const db = {
      query: vi.fn(async (sql: string, params: unknown[]) => {
        queries.push({ sql, params });
        if (sql.startsWith("SELECT to_regclass")) return { rows: [{ r: params[0] === "public.brain_facts" ? null : "x" }] };
        return { rows: [{ id: "1" }] };
      }),
    };
    const sections = await collectWorkspaceExport(db as never, { workspaceId: "w1", tenantId: "t1" });
    expect(sections.map((s) => s.name)).not.toContain("company_facts");
    expect(sections.map((s) => s.name)).toContain("requests");
    for (const q of queries.filter((q) => !q.sql.startsWith("SELECT to_regclass"))) {
      expect(q.params).toEqual(["w1", "t1"]);
      expect(q.sql).toMatch(/tenant_id=\$2/);
      // Never export idempotency/payload hashes, lease tokens or connected account ids.
      expect(q.sql).not.toMatch(/payload_hash|idempotency|lease_token|connected_account_id|content_hash/);
    }
  });
  it("CSV cells neutralize formulas", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe('"\'=HYPERLINK(""http://evil"")"');
    expect(csvCell("+33 6")).toBe('"\'+33 6"');
    expect(toCsv([{ a: 1, b: null }])).toBe('﻿"a","b"\r\n"1",""\r\n');
  });
  it("builds a zip with README, JSON and CSV files", () => {
    const zip = buildExportArchive({
      exportedAt: new Date("2026-10-02T10:00:00Z"),
      workspace: { id: "w1", tenantId: "t1", name: "Acme", slug: "acme", createdAt: "2026-09-01" },
      profile: null,
      snapshot: { missions: [] },
      sections: [
        { name: "requests", rows: [{ contact_email: "c@client.test", need_summary: "devis" }] },
        { name: "members", rows: [{ email: "owner@acme.test" }] },
      ],
      report: { drafts: 3 },
      entitlement: { state: "trialing" },
    });
    const files = readZip(zip);
    expect(Object.keys(files).sort()).toEqual(
      ["README.txt", "billing-status.json", "members.json", "requests.csv", "requests.json", "weekly-report.json", "workspace-snapshot.json", "workspace.json"].sort(),
    );
    expect(files["README.txt"]).toMatch(/jamais stocké/);
    expect(JSON.parse(files["requests.json"])[0].need_summary).toBe("devis");
  });
});

describe("erasure preconditions", () => {
  const now = Date.parse("2026-10-02T10:00:00Z");
  it("owner only, typed word, recent sign-in", () => {
    const recent = new Date(now - 5 * 60_000).toISOString();
    expect(erasurePreconditions({ role: "admin", confirm: CONFIRMATION_WORD, lastSignInAt: recent, now })?.status).toBe(403);
    expect(erasurePreconditions({ role: "owner", confirm: "supprimer", lastSignInAt: recent, now })?.status).toBe(400);
    expect(erasurePreconditions({ role: "owner", confirm: CONFIRMATION_WORD, lastSignInAt: new Date(now - 20 * 60_000).toISOString(), now })?.status).toBe(401);
    expect(erasurePreconditions({ role: "owner", confirm: CONFIRMATION_WORD, lastSignInAt: null, now })?.status).toBe(401);
    expect(erasurePreconditions({ role: "owner", confirm: CONFIRMATION_WORD, lastSignInAt: recent, now })).toBeNull();
  });
});

describe("eraseWorkspace", () => {
  const identity = { userId: "u1", workspaceId: "w1", tenantId: "t1" };
  function deps(over: Partial<EraseDeps> = {}) {
    const order: string[] = [];
    const d: EraseDeps = {
      revokeConnections: vi.fn(async () => {
        order.push("revoke");
        return { status: "revoked" as const, revoked: 2 };
      }),
      cancelSubscription: vi.fn(async () => {
        order.push("cancel");
        return "canceled" as const;
      }),
      eraseRows: vi.fn(async () => {
        order.push("erase");
        return { workspaces: 1 };
      }),
      ...over,
    };
    return { d, order };
  }
  it("revokes, then cancels, then erases", async () => {
    const { d, order } = deps();
    expect(await eraseWorkspace(identity, d)).toEqual({
      connections: { status: "revoked", revoked: 2 },
      subscription: "canceled",
      rows: { workspaces: 1 },
    });
    expect(order).toEqual(["revoke", "cancel", "erase"]);
  });
  it("stops before erasing when revocation fails", async () => {
    const { d } = deps({ revokeConnections: async () => Promise.reject(new Error("composio down")) });
    await expect(eraseWorkspace(identity, d)).rejects.toMatchObject({ step: "connections" });
    expect(d.cancelSubscription).not.toHaveBeenCalled();
    expect(d.eraseRows).not.toHaveBeenCalled();
  });
  it("stops before erasing when the subscription cannot be cancelled", async () => {
    const { d } = deps({ cancelSubscription: async () => Promise.reject(new Error("stripe down")) });
    const error = await eraseWorkspace(identity, d).catch((e) => e);
    expect(error).toBeInstanceOf(EraseError);
    expect(error.step).toBe("subscription");
    expect(d.eraseRows).not.toHaveBeenCalled();
  });
  it("calls the definer function with the confirmation token", async () => {
    const db = { query: vi.fn(async () => ({ rows: [{ counts: { workspaces: 1 } }] })) };
    expect(await eraseTenantRows(db as never, identity)).toEqual({ workspaces: 1 });
    expect(db.query).toHaveBeenCalledWith("SELECT orbis_erase_tenant($1,$2,$3) AS counts", ["w1", "t1", "erase:w1"]);
  });
});

describe("cancelTenantSubscription (Stripe mocked)", () => {
  const db = (row: unknown) => ({ query: vi.fn(async () => ({ rows: row ? [row] : [] })) });
  const stripe = (status = "active") => {
    const client = {
      subscriptions: {
        retrieve: vi.fn(async () => ({ status })),
        cancel: vi.fn(async () => ({ status: "canceled" })),
      },
    };
    return client;
  };
  it("cancels immediately, without proration, idempotently", async () => {
    const client = stripe();
    expect(await cancelTenantSubscription(db({ stripe_subscription_id: "sub_1", status: "active" }) as never, "t1", () => client)).toBe("canceled");
    expect(client.subscriptions.cancel).toHaveBeenCalledWith("sub_1", { invoice_now: false, prorate: false }, { idempotencyKey: "orbis-erase:t1:sub_1" });
  });
  it("nothing to cancel", async () => {
    const client = stripe();
    expect(await cancelTenantSubscription(db(null) as never, "t1", () => client)).toBe("none");
    expect(await cancelTenantSubscription(db({ stripe_subscription_id: "sub_1", status: "canceled" }) as never, "t1", () => client)).toBe("none");
    const ended = stripe("canceled");
    expect(await cancelTenantSubscription(db({ stripe_subscription_id: "sub_1", status: "active" }) as never, "t1", () => ended)).toBe("none");
    expect(ended.subscriptions.cancel).not.toHaveBeenCalled();
  });
  it("a live subscription without Stripe configured blocks the erasure", async () => {
    await expect(cancelTenantSubscription(db({ stripe_subscription_id: "sub_1", status: "past_due" }) as never, "t1", null)).rejects.toThrow();
  });
});

describe("revokeWorkspaceConnections (Composio mocked)", () => {
  it("deletes every account of this workspace's integration user, across pages", async () => {
    const list = vi.fn(async (q: { userIds: string[]; cursor?: string }) =>
      q.cursor ? { items: [{ id: "ca_3" }], nextCursor: null } : { items: [{ id: "ca_1" }, { id: "ca_2" }], nextCursor: "c2" },
    );
    const del = vi.fn<(id: string) => Promise<unknown>>(async () => ({}));
    const sdk: RevokeSdk = { connectedAccounts: { list, delete: del } };
    expect(await revokeWorkspaceConnections("t1", "w1", sdk)).toEqual({ status: "revoked", revoked: 3 });
    expect(list.mock.calls.every((c) => c[0].userIds.length === 1 && c[0].userIds[0] === integrationUser("t1", "w1"))).toBe(true);
    expect(del.mock.calls.map((c) => c[0])).toEqual(["ca_1", "ca_2", "ca_3"]);
  });
  it("throws (so nothing is erased) when a deletion fails", async () => {
    const sdk: RevokeSdk = {
      connectedAccounts: { list: async () => ({ items: [{ id: "ca_1" }] }), delete: async () => Promise.reject(new Error("x")) },
    };
    await expect(revokeWorkspaceConnections("t1", "w1", sdk)).rejects.toThrow(/revocation failed/);
  });
  it("not configured without an API key", async () => {
    vi.stubEnv("COMPOSIO_API_KEY", "");
    expect(await revokeWorkspaceConnections("t1", "w1")).toEqual({ status: "not_configured", revoked: 0 });
    vi.unstubAllEnvs();
  });
});

describe("deleteAuthIdentity", () => {
  it("keeps the identity when the user has other workspaces or no admin key", async () => {
    const admin = { deleteUser: vi.fn(async () => ({ error: null })) };
    expect(await deleteAuthIdentity("u1", 1, admin)).toBe("kept_other_workspaces");
    expect(await deleteAuthIdentity("u1", 0, null)).toBe("not_configured");
    expect(await deleteAuthIdentity("u1", 0, admin)).toBe("deleted");
    expect(await deleteAuthIdentity("u1", 0, { deleteUser: async () => ({ error: new Error("x") }) })).toBe("failed");
  });
});

describe("runRetentionPurge", () => {
  it("calls both definer functions and returns counts only", async () => {
    const db = {
      query: vi.fn(async (sql: string) =>
        sql.includes("orbis_retention_purge")
          ? { rows: [{ result: { inbox_previews: 2, brain_previews: 0, followup_previews: 1, request_contacts: 3 } }] }
          : { rows: [{ n: 7 }] },
      ),
    };
    const result = await runRetentionPurge(async (fn) => fn(db as never));
    expect(result).toEqual({ inbox_previews: 2, brain_previews: 0, followup_previews: 1, request_contacts: 3, rate_limit_windows: 7 });
  });
});
