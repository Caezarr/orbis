import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authConfig } from "@/lib/platform/auth";
import { isOfflineMode } from "@/lib/platform/context";

/** Refresh managed sessions before Server Components (which cannot write cookies). */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (isOfflineMode()) return response;
  const pathname = request.nextUrl.pathname;
  const publicCatalog = pathname === "/catalog" || pathname === "/catalog/";
  const protectedPage = !publicCatalog && !pathname.startsWith("/api/") && pathname !== "/" && pathname !== "/login" && !pathname.startsWith("/_next/") && !/\.[a-z0-9]+$/i.test(pathname);
  const login = () => {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("returnTo", pathname + request.nextUrl.search);
    const result = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) result.cookies.set(cookie);
    result.headers.set("Cache-Control", "private, no-store");
    return result;
  };
  try {
    const { url, key } = authConfig();
    const client = createServerClient(url, key, {
      cookieOptions: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (values) => {
          for (const { name, value } of values) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of values) response.cookies.set(name, value, options);
          response.headers.set("Cache-Control", "private, no-store");
        },
      },
    });
    const { data, error } = await client.auth.getUser();
    if (protectedPage && (error || !data.user)) return login();
  } catch { if (protectedPage) return login(); }
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"] };
