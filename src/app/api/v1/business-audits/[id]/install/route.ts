import { z } from "zod";
import { ok, fail } from "@/lib/api/http";
import { isLocalMutation } from "@/lib/api/local-request";
import { mutateStore } from "@/lib/store/store";
import { installFlow } from "@/lib/product/install";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isLocalMutation(request)) return fail("Accès local requis.", 403);
  const parsed = z
    .object({
      flowId: z.string(),
      sourcing: z.record(z.string(), z.enum(["own", "managed", "later"])),
    })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Configuration invalide.");
  const { id } = await context.params;
  try {
    return ok(
      mutateStore((s) =>
        installFlow(s, id, parsed.data.flowId, parsed.data.sourcing),
      ),
      201,
    );
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Installation impossible.");
  }
}
