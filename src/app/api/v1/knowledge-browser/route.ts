import { z } from "zod";
import { withWorkspaceRequest } from "@/lib/platform/request";
import { workspaceContext } from "@/lib/platform/context";
import { PlatformError } from "@/lib/platform/auth";
import {
  browseRemote,
  readRemote,
  remoteAccounts,
  locationSchema,
} from "@/lib/knowledge/remote";
import { createHash } from "node:crypto";
import { getStore, mutateStore } from "@/lib/store/store";
import { id } from "@/lib/ids";
import { track } from "@/lib/analytics/events";
const schema = z
  .object({
    action: z.enum(["accounts", "browse", "preview", "import"]),
    location: locationSchema,
    missionId: z.string().max(200).optional(),
    contentHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();
export async function POST(request: Request) {
  return withWorkspaceRequest(
    request,
    async () => {
      const body = schema.safeParse(await request.json().catch(() => null));
      if (!body.success)
        throw new PlatformError("Choose a source and location.", 400);
      const { action, location, missionId } = body.data;
      const state = getStore();
      if (
        missionId &&
        !state.missions.some(
          (m) => m.id === missionId && m.tenantId === state.workspace.tenantId,
        )
      )
        throw new PlatformError("Mission not found.", 404);
      if (action === "browse")
        return Response.json(await browseRemote(location));
      if (action === "accounts")
        return Response.json({ accounts: await remoteAccounts(location) });
      const { resource, text } = await readRemote(location);
      const contentHash = createHash("sha256").update(text).digest("hex");
      if (action === "preview")
        return Response.json({ resource, text, contentHash });
      if (body.data.contentHash !== contentHash)
        throw new PlatformError(
          "This file changed. Open its preview again before importing.",
          409,
        );
      const saved = mutateStore((s) => {
        let source = s.sources.find(
          (source) =>
            source.tenantId === s.workspace.tenantId &&
            source.remote?.location.provider === location.provider &&
            source.remote.location.itemId === location.itemId &&
            source.remote.location.driveId === location.driveId &&
            source.remote.location.accountId === location.accountId,
        );
        const now = new Date().toISOString();
        if (!source) {
          source = {
            id: id("src"),
            tenantId: s.workspace.tenantId,
            name: resource.name,
            kind: "connection",
            status: "ready",
            origin: resource.url ?? `${location.provider}:${resource.id}`,
            excerpt: text,
            version: id("sv"),
            required: false,
            createdAt: now,
          };
          s.sources.unshift(source);
        } else if (source.excerpt !== text || source.status !== "ready") {
          source.version = id("sv");
          source.excerpt = text;
          source.status = "ready";
          source.name = resource.name;
        }
        source.remote = {
          location: { ...location, cursor: undefined },
          verifiedAt: now,
        };
        if (missionId) {
          const mission = s.missions.find((m) => m.id === missionId)!;
          const version = s.missionVersions.find(
            (v) =>
              v.id === mission.draftVersionId &&
              v.tenantId === s.workspace.tenantId,
          );
          if (!version)
            throw new PlatformError("Mission setup unavailable.", 409);
          if (!version.knowledgeSourceIds.includes(source.id))
            version.knowledgeSourceIds.push(source.id);
          mission.state = "testing";
        }
        return source;
      });
      await track("knowledge_selected");
      return Response.json(saved, { status: 201 });
    },
    { requireRole: ["owner", "admin"] },
  );
}
