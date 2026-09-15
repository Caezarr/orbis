import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authClient, isSameOriginMutation, PlatformError, safeReturnTo } from "@/lib/platform/auth";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ action: string }> }) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Same-origin request required" }, { status: 403 });
  const { action } = await context.params;
  if (!["sign-in", "sign-up", "sign-out"].includes(action)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const client = await authClient();
    if (action === "sign-out") {
      const { error } = await client.auth.signOut();
      if (error) return NextResponse.json({ error: "Sign-out failed. Please retry." }, { status: 503 });
      (await cookies()).delete("orbis_workspace");
      return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    }
    let body: { email?: unknown; password?: unknown; returnTo?: unknown };
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
    if (!body || typeof body.email !== "string" || typeof body.password !== "string" || body.email.length > 254 || body.password.length > 1024 || !body.email.includes("@") || body.password.length < (action === "sign-up" ? 12 : 1)) {
      return NextResponse.json({ error: "Enter a valid email and password (12 characters minimum when signing up)." }, { status: 400 });
    }
    if (action === "sign-in") {
      const { error } = await client.auth.signInWithPassword({ email: body.email, password: body.password });
      if (error) return NextResponse.json({ error: "Sign-in failed. Check your credentials and email confirmation." }, { status: error.status === 429 ? 429 : 401 });
      return NextResponse.json({ ok: true, redirectTo: safeReturnTo(body.returnTo) }, { headers: { "Cache-Control": "no-store" } });
    }
    const redirectTo = safeReturnTo(body.returnTo);
    (await cookies()).set("orbis_auth_return_to", redirectTo, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 3600 });
    const origin = process.env.APP_ORIGIN ?? new URL(request.url).origin;
    const { data, error } = await client.auth.signUp({
      email: body.email, password: body.password,
      options: { emailRedirectTo: new URL("/api/auth/callback", origin).toString() },
    });
    if (error) return NextResponse.json({ error: "Unable to create account. Please retry later or sign in." }, { status: error.status === 429 ? 429 : 400 });
    return NextResponse.json({ ok: true, redirectTo, confirmationRequired: !data.session }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: "Authentication service unavailable" }, { status: error instanceof PlatformError ? error.status : 503 });
  }
}
