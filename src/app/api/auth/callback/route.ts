import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authClient, safeReturnTo, TERMS_VERSION } from "@/lib/platform/auth";

export const runtime = "nodejs";

/**
 * Supabase redirect target for email confirmation, magic links and OAuth.
 * PKCE `code` only: the exchange needs the verifier cookie set in the browser
 * that asked for the link. A `token_hash` URL is refused on purpose: it
 * verifies in any browser, so a link built from someone else's token would
 * sign the visitor into that person's account (login CSRF), and a mailbox
 * connected next would land in the wrong workspace. Our templates use
 * `{{ .ConfirmationURL }}`, which comes back here with `?code=`.
 * The destination comes only from the httpOnly return-to cookie, through the
 * safeReturnTo allowlist.
 */
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
