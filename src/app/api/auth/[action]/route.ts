import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authClient, authConfig, isSameOriginMutation, PlatformError } from "@/lib/platform/auth";
import { MESSAGES, runAuthAction } from "@/lib/platform/auth-actions";
import { createSharedLimiter } from "@/lib/platform/limits";
import { clientKey } from "@/lib/start/public-site";

export const runtime = "nodejs";

// Shared across instances (migration 012), in-memory pre-check; fail open to
// the in-memory layer (Supabase applies its own auth rate limits as well).
const ipLimiter = createSharedLimiter({ bucket: "auth_ip", limit: 30, windowMs: 10 * 60_000 });
const emailLimiter = createSharedLimiter({ bucket: "auth_email", limit: 8, windowMs: 10 * 60_000 });
const otpLimiter = createSharedLimiter({ bucket: "auth_otp", limit: 3, windowMs: 15 * 60_000 });
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request, context: { params: Promise<{ action: string }> }) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Same-origin request required" }, { status: 403, headers });
  const { action } = await context.params;
  if (!["sign-in", "sign-up", "sign-out", "magic-link", "oauth"].includes(action))
    return NextResponse.json({ error: "Not found" }, { status: 404, headers });
  try {
    const client = await authClient();
    const jar = await cookies();
    if (action === "sign-out") {
      const { error } = await client.auth.signOut();
      if (error) return NextResponse.json({ error: "Déconnexion impossible. Réessayez." }, { status: 503, headers });
      jar.delete("orbis_workspace");
      return NextResponse.json({ ok: true }, { headers });
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: MESSAGES.invalid }, { status: 400, headers });
    }
    const result = await runAuthAction(action, body, {
      auth: client.auth,
      origin: process.env.APP_ORIGIN ?? new URL(request.url).origin,
      clientKey: clientKey(request),
      ipLimiter,
      emailLimiter,
      otpLimiter,
      providerOrigin: new URL(authConfig().url).origin,
      setCookie: (name, value, maxAge) =>
        jar.set(name, value, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge }),
    });
    return NextResponse.json(result.body, { status: result.status, headers });
  } catch (error) {
    return NextResponse.json({ error: MESSAGES.unavailable }, { status: error instanceof PlatformError ? error.status : 503, headers });
  }
}
