import { z } from "zod";
import { getStore, mutateStore } from "@/lib/store/store";
import { isLocalMutation } from "@/lib/api/local-request";
import { id } from "@/lib/ids";
import { ok, fail } from "@/lib/api/http";
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("member"),
    name: z.string().trim().min(2).max(100),
    email: z.string().email().max(254),
    role: z.enum(["operator", "admin", "expert"]),
  }),
  z.object({
    action: z.literal("group"),
    name: z.string().trim().min(2).max(100),
    memberIds: z.array(z.string()).max(100),
  }),
]);
export async function GET() {
  const state = getStore();
  return ok({ members: state.memberships, groups: state.teamGroups ?? [] });
}
export async function POST(request: Request) {
  if (!isLocalMutation(request))
    return fail("This installation accepts local changes only.", 403);
  const result = schema.safeParse(await request.json().catch(() => null));
  if (!result.success)
    return fail("Check the name, email and selected members.");
  const body = result.data,
    state = getStore();
  if (
    body.action === "member" &&
    state.memberships.some(
      (m) => m.email.toLowerCase() === body.email.toLowerCase(),
    )
  )
    return fail("This person is already in your directory.", 409);
  if (
    body.action === "group" &&
    body.memberIds.some((mid) => !state.memberships.some((m) => m.id === mid))
  )
    return fail("Select members from this workspace.");
  mutateStore((s) => {
    if (body.action === "member") {
      s.memberships.push({
        id: id("member"),
        userId: id("user"),
        workspaceId: s.workspace.id,
        tenantId: s.workspace.tenantId,
        name: body.name,
        email: body.email,
        role: body.role,
      });
    } else {
      (s.teamGroups ??= []).push({
        id: id("group"),
        name: body.name,
        memberIds: body.memberIds,
      });
    }
  });
  return ok({ saved: true }, 201);
}
