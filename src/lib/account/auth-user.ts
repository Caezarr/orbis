import { createClient } from "@supabase/supabase-js";
import { authConfig } from "@/lib/platform/auth";

/*
 * Deletes the Supabase Auth identity (email, provider links) after a workspace
 * erasure, when SUPABASE_SERVICE_ROLE_KEY is configured on the server and the
 * user belongs to no other workspace. The key is server-only (never
 * NEXT_PUBLIC_*), used for this single admin call. Without it, the identity
 * stays in Supabase Auth: the operator deletes it on request (launch checklist).
 */
export type AdminAuth = { deleteUser(id: string): Promise<{ error: unknown }> };

export function adminAuth(): AdminAuth | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) return null;
  const { url } = authConfig();
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }).auth.admin;
}

export async function deleteAuthIdentity(
  userId: string,
  otherWorkspaces: number,
  admin: AdminAuth | null = adminAuth(),
): Promise<"deleted" | "kept_other_workspaces" | "not_configured" | "failed"> {
  if (otherWorkspaces > 0) return "kept_other_workspaces";
  if (!admin) return "not_configured";
  try {
    const { error } = await admin.deleteUser(userId);
    return error ? "failed" : "deleted";
  } catch {
    return "failed";
  }
}
