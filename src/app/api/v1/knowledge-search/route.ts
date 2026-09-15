import { z } from "zod";
import { fail, ok } from "@/lib/api/http";
import { getStore } from "@/lib/store/store";
import { retrieveKnowledge } from "@/lib/knowledge";
import { withWorkspaceRequest } from "@/lib/platform/request";

const schema = z
  .object({
    query: z.string().trim().min(1).max(2000),
    sourceIds: z.array(z.string().min(1).max(200)).max(500),
    missionId: z.string().min(1).max(200).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .strict();

export async function POST(request: Request) {
  return withWorkspaceRequest(request, async () => {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return fail(
        "Provide a query and a source selection (maximum 500 sources).",
      );
    const items = retrieveKnowledge({ state: getStore(), ...parsed.data });
    const response = ok({ items, method: "lexical-bm25" });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  });
}
