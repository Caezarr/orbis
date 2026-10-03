import { withWorkspaceRequest } from "@/lib/platform/request";
import { getStore } from "@/lib/store/store";
import { startReadiness } from "@/lib/start/server";

export const runtime = "nodejs";
/** Session required: readiness of the /start steps for the session workspace. */
export async function GET(request: Request) {
  return withWorkspaceRequest(request, async () => Response.json(startReadiness(getStore())));
}
