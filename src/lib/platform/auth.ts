import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export class PlatformError extends Error {
  constructor(message: string, public status = 500) { super(message); }
}
export function authConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new PlatformError("Authentication is not configured", 503);
  return { url, key };
}
export async function authClient() {
  const jar = await cookies();
  const { url, key } = authConfig();
  return createServerClient(url, key, {
    cookieOptions: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" },
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (values) => {
        // Server Components cannot set cookies; proxy refreshes them before rendering.
        try { for (const { name, value, options } of values) jar.set(name, value, options); } catch {}
      },
    },
  });
}
export async function authenticatedUser() {
  const client = await authClient();
  // Validated by the provider; getSession() alone would trust cookie contents.
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new PlatformError("Authentication required", 401);
  return data.user;
}

export function isSameOriginMutation(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (!origin || request.headers.get("sec-fetch-site") === "cross-site") return false;
    const expected = process.env.APP_ORIGIN ? new URL(process.env.APP_ORIGIN).origin : new URL(request.url).origin;
    return new URL(origin).origin === expected;
  } catch { return false; }
}
