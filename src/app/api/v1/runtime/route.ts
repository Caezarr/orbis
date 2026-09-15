import { withWorkspaceRequest } from "@/lib/platform/request";
import { ok } from "@/lib/api/http";
import { providerStatus } from "@/lib/runtime/provider";
export async function GET(request: Request) {
  return withWorkspaceRequest(request, async () => {
  return ok(providerStatus());
  });
}
