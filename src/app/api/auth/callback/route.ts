import { NextResponse } from "next/server";
import { authClient, safeReturnTo } from "@/lib/platform/auth";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = process.env.APP_ORIGIN ?? url.origin;
  const code = url.searchParams.get("code");
  if (code) {
    try {
      const client = await authClient();
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (!error) {
        const jar = await cookies();
        const returnTo = safeReturnTo(jar.get("orbis_auth_return_to")?.value);
        jar.delete("orbis_auth_return_to");
        return NextResponse.redirect(new URL(returnTo, origin));
      }
    } catch {}
  }
  return NextResponse.redirect(new URL("/login?error=confirmation", origin));
}
