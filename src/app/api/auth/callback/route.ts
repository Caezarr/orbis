import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authClient, safeReturnTo, TERMS_VERSION } from "@/lib/platform/auth";

export const runtime = "nodejs";

const OTP_TYPES = new Set(["email", "magiclink", "signup"]);

/**
 * Supabase redirect target for email confirmation, magic links (PKCE `code`
 * or `token_hash` templates) and OAuth. The destination comes only from the
 * httpOnly return-to cookie, through the safeReturnTo allowlist.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = process.env.APP_ORIGIN ?? url.origin;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") ?? "";
  if (code || (tokenHash && OTP_TYPES.has(type))) {
    try {
      const client = await authClient();
      const { error } = code
        ? await client.auth.exchangeCodeForSession(code)
        : await client.auth.verifyOtp({ token_hash: tokenHash!, type: type as "email" | "magiclink" | "signup" });
      if (!error) {
        const jar = await cookies();
        const returnTo = safeReturnTo(jar.get("orbis_auth_return_to")?.value);
        jar.delete("orbis_auth_return_to");
        // OAuth sign-up from /start: record the CGU acceptance given before the
        // provider redirect (password and magic-link sign-ups record it at creation).
        if (jar.get("orbis_terms_pending")?.value === TERMS_VERSION) {
          await client.auth
            .updateUser({ data: { terms_version: TERMS_VERSION, terms_accepted_at: new Date().toISOString() } })
            .catch(() => undefined);
          jar.delete("orbis_terms_pending");
        }
        return NextResponse.redirect(new URL(returnTo, origin));
      }
    } catch {}
  }
  return NextResponse.redirect(new URL("/login?error=confirmation", origin));
}
