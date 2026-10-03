/*
 * Security headers applied to every response by next.config.ts (headers()).
 * Imported by next.config.ts: keep this file free of "@/" imports and of
 * server-only modules.
 *
 * CSP without nonces (Next.js guide "Without Nonces"): App Router hydration
 * uses inline scripts, so script-src keeps 'unsafe-inline'; the real protection
 * here is frame-ancestors 'none', object-src 'none', base-uri 'self',
 * form-action 'self' and a closed connect-src list. Moving to nonces requires
 * dynamic rendering of every page (proxy-generated nonce) — see
 * docs/product/launch-hardening.md.
 */

type Env = Record<string, string | undefined>;

function origin(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

/** True when the public origin is HTTPS (Vercel or a configured https APP_ORIGIN). */
export function servedOverHttps(env: Env = process.env) {
  if (env.VERCEL === "1") return true;
  const configured = env.APP_ORIGIN ?? env.ORBIS_APP_URL ?? "";
  return configured.startsWith("https://");
}

export function contentSecurityPolicy(env: Env = process.env) {
  const dev = env.NODE_ENV === "development";
  const supabase = origin(env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL);
  const supabaseWs = supabase ? supabase.replace(/^http/, "ws") : null;
  const connect = [
    "'self'",
    supabase,
    supabaseWs,
    "https://api.stripe.com",
    // Vercel Speed Insights (already in the app): same-origin /_vercel in production,
    // these hosts in development / fallback.
    "https://va.vercel-scripts.com https://vitals.vercel-insights.com",
    // Optional browser analytics / monitoring endpoints, only when configured.
    origin(env.NEXT_PUBLIC_POSTHOG_HOST),
    env.NEXT_PUBLIC_SENTRY_DSN ? "https://*.ingest.sentry.io https://*.ingest.de.sentry.io" : null,
    dev ? "ws: http://localhost:* http://127.0.0.1:*" : null,
  ].filter(Boolean);
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""} https://js.stripe.com https://va.vercel-scripts.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connect.join(" ")}`,
    "frame-src https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com",
    "worker-src 'self' blob:",
    "media-src 'self' blob: data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(servedOverHttps(env) ? ["upgrade-insecure-requests"] : []),
  ];
  return directives.join("; ");
}

export function securityHeaders(env: Env = process.env): { key: string; value: string }[] {
  const headers = [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(env) },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=(), payment=(self)" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
  // HSTS only when the site is actually served over HTTPS (never on http://localhost).
  if (servedOverHttps(env)) headers.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" });
  return headers;
}
