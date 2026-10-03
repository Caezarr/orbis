import { buildExportArchive, collectWorkspaceExport, snapshotForExport } from "@/lib/account/export";
import { currentEntitlement } from "@/lib/billing/entitlements-store";
import { workspaceContext } from "@/lib/platform/context";
import { logEvent } from "@/lib/platform/observability";
import { withWorkspaceRequest } from "@/lib/platform/request";
import { weeklyReport } from "@/lib/followups/service";
import { inboxDraftsEnabled } from "@/lib/inbox/flags";

export const runtime = "nodejs";
export const maxDuration = 60;

/** GDPR export (owner/admin): ZIP of the session workspace's own data. */
export async function GET(request: Request) {
  return withWorkspaceRequest(
    request,
    async () => {
      const ctx = workspaceContext();
      if (!ctx?.db)
        return Response.json({ error: "L’export nécessite la base de données de production." }, { status: 503 });
      const ids = { workspaceId: ctx.workspaceId, tenantId: ctx.tenantId };
      const now = new Date();
      const sections = await collectWorkspaceExport(ctx.db, ids);
      let report: unknown;
      if (inboxDraftsEnabled())
        try {
          report = await weeklyReport(undefined, now);
        } catch {
          report = undefined;
        }
      let entitlement: unknown;
      try {
        entitlement = await currentEntitlement(ctx.db, ids, now);
      } catch {
        entitlement = undefined;
      }
      const zip = buildExportArchive({
        exportedAt: now,
        workspace: ctx.state.workspace,
        profile: ctx.state.profile,
        snapshot: snapshotForExport(ctx.state),
        sections,
        report,
        entitlement,
      });
      logEvent("info", "workspace_exported", { sections: sections.length, bytes: zip.length });
      return new Response(zip as unknown as BodyInit, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="orbis-export-${now.toISOString().slice(0, 10)}.zip"`,
          "Cache-Control": "no-store",
        },
      });
    },
    { requireRole: ["owner", "admin"] },
  );
}
