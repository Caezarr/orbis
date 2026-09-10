import { ok } from "@/lib/api/http";
import { providerStatus } from "@/lib/runtime/provider";
export async function GET() {
  return ok(providerStatus());
}
