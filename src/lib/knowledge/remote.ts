import { Composio } from "@composio/core";
import { z } from "zod";
import {
  authConfigId,
  toolkitSlug,
  integrationUser,
} from "@/lib/integrations/composio";
import { workspaceContext } from "@/lib/platform/context";
import { PlatformError } from "@/lib/platform/auth";
import { createHash } from "node:crypto";
import { downloadText } from "./download";

export const locationSchema = z
  .object({
    provider: z.enum(["sharepoint", "googledrive", "notion"]),
    accountId: z.string().max(200).optional(),
    siteId: z.string().max(500).optional(),
    driveId: z.string().max(500).optional(),
    itemId: z.string().max(500).optional(),
    cursor: z.string().max(4000).optional(),
    query: z.string().max(100).optional(),
  })
  .strict();
export type Location = z.infer<typeof locationSchema>;
export type RemoteItem = {
  id: string;
  name: string;
  kind: "site" | "library" | "folder" | "file" | "page" | "database";
  location: Location;
  url?: string;
  version?: string;
  size?: number;
  mime?: string;
};
const enc = encodeURIComponent;
const graph = "https://graph.microsoft.com/v1.0";
const gdrive = "https://www.googleapis.com/drive/v3";
function safeLink(raw: unknown, provider: Location["provider"]) {
  if (typeof raw !== "string") return undefined;
  try {
    const u = new URL(raw);
    const hosts = {
      sharepoint: /(^|\.)sharepoint\.com$/,
      googledrive: /^(drive|docs)\.google\.com$/,
      notion: /(^|\.)(notion\.so|notion\.site)$/,
    };
    return u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      hosts[provider].test(u.hostname)
      ? u.href
      : undefined;
  } catch {
    return undefined;
  }
}
/** Read-only broker: exact provider endpoints, workspace-owned account, no caller URLs. */
async function connection(location: Location) {
  const ctx = workspaceContext();
  if (!ctx?.db)
    throw new PlatformError("Connect a workspace to browse your files.", 503);
  const config = authConfigId(location.provider),
    toolkit = toolkitSlug(location.provider);
  if (!process.env.COMPOSIO_API_KEY || !config || !toolkit)
    throw new PlatformError(
      "Ask your administrator to enable this connection, then connect your account.",
      503,
    );
  const sdk = new Composio({
    apiKey: process.env.COMPOSIO_API_KEY,
    allowTracking: false,
    fileUploadDirs: false,
    dangerouslyAllowAutoUploadDownloadFiles: false,
  });
  const options = { signal: AbortSignal.timeout(15000) };
  const auth = await sdk.authConfigs.get(config, options);
  if (auth.status !== "ENABLED" || auth.toolkit.slug !== toolkit)
    throw new PlatformError("Connection configuration unavailable.", 503);
  const accounts = await sdk.connectedAccounts.list(
    {
      userIds: [integrationUser(ctx.tenantId, ctx.workspaceId)],
      authConfigIds: [config],
      toolkitSlugs: [toolkit],
      accountType: "PRIVATE",
      limit: 100,
    },
    options,
  );
  const active = accounts.items.filter(
    (a) =>
      a.status === "ACTIVE" &&
      !a.isDisabled &&
      !a.authConfig.isDisabled &&
      a.authConfig.id === config &&
      a.toolkit.slug === toolkit,
  );
  if (accounts.nextCursor)
    throw new PlatformError(
      "Too many connected accounts. Ask your administrator to narrow this workspace's connections.",
      409,
    );
  return { ctx, sdk, options, active };
}
export async function remoteAccounts(location: Location) {
  const { active } = await connection(location);
  return active.map((account, index) => ({
    id: account.id,
    label: `Connected account ${index + 1} · ${account.id.slice(-8)}`,
  }));
}
async function reader(location: Location) {
  const { ctx, sdk, options, active } = await connection(location);
  const account = location.accountId
    ? active.find((a) => a.id === location.accountId)
    : active.length === 1
      ? active[0]
      : undefined;
  if (!account)
    throw new PlatformError(
      active.length > 1
        ? "Choose a connected account."
        : "Connect this tool first, then return to choose files.",
      409,
    );
  // Bind returned file locations to the account that was actually checked.
  location.accountId = account.id;
  return async (
    endpoint: string,
    method: "GET" | "POST" = "GET",
    body?: unknown,
  ): Promise<unknown> => {
    const policyHash = createHash("sha256")
      .update(JSON.stringify({ account: account.id, endpoint, method, body }))
      .digest("hex");
    const result = await sdk.tools.proxyExecute(
      {
        connectedAccountId: account.id,
        endpoint,
        method,
        body,
        ...(location.provider === "notion"
          ? {
              parameters: [
                {
                  in: "header" as const,
                  name: "Notion-Version",
                  value: "2022-06-28",
                },
              ],
            }
          : {}),
      },
      options,
    );
    if (result.status < 200 || result.status >= 300)
      throw new PlatformError(
        result.status === 403
          ? "This account cannot read this resource. Check its sharing permissions."
          : "The file could not be read. Reconnect or choose another file.",
        409,
      );
    // Store only a digest of reads in the local audit, never tokens or provider payloads.
    await ctx.db!.query(
      "INSERT INTO product_events(id,workspace_id,tenant_id,actor_id,event,properties,exported_at) VALUES(gen_random_uuid(),$1,$2,$3,'knowledge_read',$4::jsonb,now())",
      [
        ctx.workspaceId,
        ctx.tenantId,
        ctx.userId,
        JSON.stringify({ policy_hash: policyHash }),
      ],
    );
    if (result.binary_data) {
      if (result.binary_data.size > 2000000)
        throw new PlatformError("File exceeds 2 MB.", 422);
      return downloadText(result.binary_data.url);
    }
    return result.data;
  };
}
const object = (v: unknown): Record<string, any> => {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new PlatformError("Unexpected file response.", 502);
  return v as Record<string, any>;
};
function item(
  raw: Record<string, any>,
  location: Location,
  kind?: RemoteItem["kind"],
): RemoteItem {
  return {
    id: String(raw.id),
    name: String(
      raw.name ??
        raw.displayName ??
        raw.properties?.title?.title?.map((t: any) => t.plain_text).join("") ??
        raw.title?.map((t: any) => t.plain_text).join("") ??
        "Untitled",
    ),
    kind: kind ?? (raw.folder ? "folder" : "file"),
    location: { ...location, cursor: undefined, itemId: String(raw.id) },
    url: safeLink(raw.webUrl ?? raw.webViewLink ?? raw.url, location.provider),
    version: String(raw.eTag ?? raw.modifiedTime ?? raw.last_edited_time ?? ""),
    size: Number(raw.size ?? 0),
    mime: raw.file?.mimeType ?? raw.mimeType,
  };
}
export async function browseRemote(
  location: Location,
): Promise<{ items: RemoteItem[]; cursor?: string }> {
  const read = await reader(location);
  if (location.provider === "sharepoint") {
    const path = !location.siteId
      ? `/sites?search=${enc(location.query?.trim() || "*")}`
      : !location.driveId
        ? `/sites/${enc(location.siteId)}/drives`
        : `/drives/${enc(location.driveId)}/${location.itemId ? `items/${enc(location.itemId)}` : "root"}/children`;
    const data = object(
      await read(
        `${graph}${path}${path.includes("?") ? "&" : "?"}$top=50${location.cursor ? `&$skiptoken=${enc(location.cursor)}` : ""}`,
      ),
    );
    const items = (data.value ?? []).map((r: Record<string, any>) =>
      !location.siteId
        ? {
            ...item(r, location, "site"),
            location: { ...location, siteId: String(r.id), cursor: undefined },
          }
        : !location.driveId
          ? {
              ...item(r, location, "library"),
              location: {
                ...location,
                driveId: String(r.id),
                itemId: undefined,
                cursor: undefined,
              },
            }
          : item(r, location),
    );
    const next = data["@odata.nextLink"]
      ? (new URL(data["@odata.nextLink"]).searchParams.get("$skiptoken") ??
        undefined)
      : undefined;
    return { items, cursor: next };
  }
  if (location.provider === "googledrive") {
    const parent = location.itemId ?? "root";
    const query = `'${parent.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}' in parents and trashed = false`;
    const params = new URLSearchParams({
      q: query,
      pageSize: "50",
      fields:
        "nextPageToken,files(id,name,mimeType,modifiedTime,size,webViewLink)",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
      ...(location.cursor ? { pageToken: location.cursor } : {}),
    });
    const data = object(await read(`${gdrive}/files?${params}`));
    return {
      items: (data.files ?? []).map((r: Record<string, any>) =>
        item(
          r,
          location,
          r.mimeType === "application/vnd.google-apps.folder"
            ? "folder"
            : "file",
        ),
      ),
      cursor: data.nextPageToken,
    };
  }
  const data = object(
    await read(
      location.itemId
        ? `https://api.notion.com/v1/databases/${enc(location.itemId)}/query`
        : "https://api.notion.com/v1/search",
      "POST",
      {
        page_size: 50,
        ...(!location.itemId && location.query
          ? { query: location.query }
          : {}),
        ...(location.cursor ? { start_cursor: location.cursor } : {}),
      },
    ),
  );
  return {
    items: (data.results ?? []).map((r: Record<string, any>) =>
      item(r, location, r.object === "database" ? "database" : "page"),
    ),
    cursor: data.has_more ? data.next_cursor : undefined,
  };
}
export async function readRemote(
  location: Location,
): Promise<{ resource: RemoteItem; text: string }> {
  if (!location.itemId) throw new PlatformError("Choose a file first.", 400);
  const read = await reader(location);
  let metadata: Record<string, any>, text: unknown;
  if (location.provider === "sharepoint") {
    if (!location.driveId)
      throw new PlatformError("Choose a document library.", 400);
    const base = `${graph}/drives/${enc(location.driveId)}/items/${enc(location.itemId)}`;
    metadata = object(await read(base));
    if (metadata.folder || Number(metadata.size) > 2000000)
      throw new PlatformError("Choose a file smaller than 2 MB.", 422);
    if (!/\.(txt|md|csv)$/i.test(String(metadata.name)))
      throw new PlatformError(
        "Choose a text export (.txt, .md, .csv). Office/PDF extraction is not enabled yet.",
        422,
      );
    text = await read(`${base}/content`);
  } else if (location.provider === "googledrive") {
    const base = `${gdrive}/files/${enc(location.itemId)}`;
    metadata = object(
      await read(
        `${base}?fields=id,name,mimeType,modifiedTime,size,webViewLink&supportsAllDrives=true`,
      ),
    );
    if (Number(metadata.size) > 2000000)
      throw new PlatformError("Choose a file smaller than 2 MB.", 422);
    if (metadata.mimeType === "application/vnd.google-apps.document")
      text = await read(`${base}/export?mimeType=text%2Fplain`);
    else if (/^text\//.test(metadata.mimeType))
      text = await read(`${base}?alt=media&supportsAllDrives=true`);
    else
      throw new PlatformError(
        "Choose a Google document or a text export (.txt, .md, .csv).",
        422,
      );
  } else {
    metadata = object(
      await read(`https://api.notion.com/v1/pages/${enc(location.itemId)}`),
    );
    let cursor: string | undefined;
    const lines: string[] = [];
    for (let page = 0; page < 10; page++) {
      const data = object(
        await read(
          `https://api.notion.com/v1/blocks/${enc(location.itemId)}/children?page_size=100${cursor ? `&start_cursor=${enc(cursor)}` : ""}`,
        ),
      );
      for (const block of data.results ?? []) {
        if (
          block.has_children ||
          ![
            "paragraph",
            "heading_1",
            "heading_2",
            "heading_3",
            "bulleted_list_item",
            "numbered_list_item",
            "quote",
            "callout",
            "divider",
          ].includes(block.type)
        )
          throw new PlatformError(
            "This page contains nested or unsupported blocks. Choose a text export to include all content.",
            422,
          );
        lines.push(
          (block[block.type]?.rich_text ?? [])
            .map((t: any) => t.plain_text ?? t.text?.content ?? "")
            .join(""),
        );
      }
      if (!data.has_more) {
        cursor = undefined;
        break;
      }
      cursor = data.next_cursor;
    }
    if (cursor)
      throw new PlatformError(
        "This page is too large. Select a smaller source.",
        422,
      );
    text = lines.join("\n");
  }
  if (typeof text !== "string" || !text.trim() || text.length > 20000)
    throw new PlatformError(
      "Select a non-empty text document under 20,000 characters.",
      422,
    );
  return {
    resource: item(
      metadata,
      location,
      location.provider === "notion" ? "page" : "file",
    ),
    text,
  };
}
