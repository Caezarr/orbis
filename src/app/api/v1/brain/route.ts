import { withWorkspaceRequest } from "@/lib/platform/request";
import { brainOverview } from "@/lib/brain/service";
import { brainUnavailable } from "./gate";

export const runtime = "nodejs";
/** Company sheet: facts (candidates first in the UI), conflicts, /start profile facts, last extraction. */
export async function GET(request: Request) {
  return withWorkspaceRequest(request, async () => {
    return brainUnavailable() ?? Response.json(await brainOverview());
  });
}
