import { z } from "zod";
import { businessWorkflows } from "@/lib/workflows/blueprints";
import { mutateStore } from "@/lib/store/store";
import { isLocalMutation } from "@/lib/api/local-request";
import { fail, ok } from "@/lib/api/http";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isLocalMutation(request))
    return fail(
      "Authenticated workspace access is required. This installation is local-only.",
      403,
    );
  const { id } = await params;
  const workflow = businessWorkflows.find((w) => w.id === id);
  if (!workflow) return fail("Workflow not found.", 404);
  const schema = z.object({
    answers: z
      .object(
        Object.fromEntries(
          workflow.questions.map((q) => [
            q.key,
            z.string().trim().min(10).max(4000),
          ]),
        ),
      )
      .strict(),
  });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return fail("Complete each setup field with at least 10 characters.");
  mutateStore((s) => {
    const list = (s.workflowBriefs ??= []);
    const entry = {
      workflowId: id,
      tenantId: s.workspace.tenantId,
      answers: parsed.data.answers,
      updatedAt: new Date().toISOString(),
    };
    const index = list.findIndex(
      (b) => b.workflowId === id && b.tenantId === s.workspace.tenantId,
    );
    if (index < 0) list.push(entry);
    else list[index] = entry;
  });
  return ok({
    saved: true,
    workflowId: id,
    status: "brief_saved",
    active: false,
  });
}
