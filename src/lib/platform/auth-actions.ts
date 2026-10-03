import { z } from "zod";
import { authOptions, safeReturnTo, TERMS_VERSION, type AuthOptions } from "./auth";
import type { SharedLimiter } from "./limits";

/*
 * Auth actions behind POST /api/auth/[action], written against a minimal
 * Supabase auth surface so they are testable without the provider.
 *
 * Anti-enumeration: sign-up and magic-link answers are identical whether the
 * address exists or not; sign-in failures never say which part was wrong.
 * Anti brute-force: per-IP and per-address limits (shared across instances),
 * on top of Supabase's own rate limits. Every error message is generic.
 */

export type AuthProvider = "google" | "azure";
export type SupabaseAuthSurface = {
  signInWithPassword(input: { email: string; password: string }): Promise<{ error: { status?: number } | null }>;
  signUp(input: {
    email: string;
    password: string;
    options: { emailRedirectTo: string; data: Record<string, string> };
  }): Promise<{ data: { session: unknown | null }; error: { status?: number } | null }>;
  signInWithOtp(input: {
    email: string;
    options: { emailRedirectTo: string; shouldCreateUser: boolean; data?: Record<string, string> };
  }): Promise<{ error: { status?: number } | null }>;
  signInWithOAuth(input: {
    provider: AuthProvider;
    options: { redirectTo: string; skipBrowserRedirect: boolean; scopes?: string };
  }): Promise<{ data: { url: string | null }; error: { status?: number } | null }>;
};

export type AuthActionDeps = {
  auth: SupabaseAuthSurface;
  origin: string;
  clientKey: string;
  ipLimiter: SharedLimiter;
  emailLimiter: SharedLimiter;
  otpLimiter: SharedLimiter;
  options?: AuthOptions;
  /** Origin of the Supabase project: the OAuth redirect must point there. */
  providerOrigin?: string;
  /** Short-lived httpOnly cookies (returnTo, pending CGU acceptance). */
  setCookie(name: string, value: string, maxAgeSeconds: number): void;
};

export type AuthActionResult = { status: number; body: Record<string, unknown> };

export const MESSAGES = {
  invalid: "Indiquez une adresse e-mail valide.",
  password: "Indiquez une adresse e-mail valide et un mot de passe (12 caractères minimum à la création).",
  terms: "Acceptez les conditions générales d’utilisation pour créer un compte.",
  signIn: "Connexion impossible. Vérifiez vos identifiants et la confirmation de votre adresse.",
  signUp: "Création impossible pour le moment. Réessayez plus tard ou connectez-vous.",
  limited: "Trop de tentatives. Réessayez dans quelques minutes.",
  sent: "Si cette adresse peut se connecter, un lien vient de lui être envoyé. Il est valable peu de temps et doit être ouvert dans ce navigateur.",
  disabled: "Cette méthode de connexion n’est pas disponible.",
  unavailable: "Service d’authentification indisponible.",
} as const;

const email = z.string().trim().toLowerCase().min(3).max(254).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
const base = { returnTo: z.unknown().optional() };
export const passwordSchema = z.object({ email, password: z.string().min(1).max(1024), acceptTerms: z.boolean().optional(), ...base });
export const magicLinkSchema = z.object({ email, intent: z.enum(["sign-in", "sign-up"]).default("sign-in"), acceptTerms: z.boolean().optional(), ...base });
export const oauthSchema = z.object({ provider: z.enum(["google", "microsoft"]), intent: z.enum(["sign-in", "sign-up"]).default("sign-in"), acceptTerms: z.boolean().optional(), ...base });

const ok = (body: Record<string, unknown>): AuthActionResult => ({ status: 200, body: { ok: true, ...body } });
const fail = (status: number, error: string): AuthActionResult => ({ status, body: { error } });

function callback(origin: string) {
  return new URL("/api/auth/callback", origin).toString();
}
function termsData() {
  return { terms_version: TERMS_VERSION, terms_accepted_at: new Date().toISOString() };
}

export async function runAuthAction(action: string, raw: unknown, deps: AuthActionDeps): Promise<AuthActionResult> {
  const options = deps.options ?? authOptions();
  const ip = await deps.ipLimiter.take(deps.clientKey);
  if (!ip.allowed) return fail(429, MESSAGES.limited);
  const returnTo = safeReturnTo((raw as { returnTo?: unknown } | null)?.returnTo);

  if (action === "sign-in" || action === "sign-up") {
    if (!options.password) return fail(404, MESSAGES.disabled);
    const parsed = passwordSchema.safeParse(raw);
    if (!parsed.success || (action === "sign-up" && parsed.data.password.length < 12)) return fail(400, MESSAGES.password);
    const { email: address, password, acceptTerms } = parsed.data;
    if (!(await deps.emailLimiter.take(address)).allowed) return fail(429, MESSAGES.limited);
    if (action === "sign-in") {
      const { error } = await deps.auth.signInWithPassword({ email: address, password });
      if (error) return fail(error.status === 429 ? 429 : 401, error.status === 429 ? MESSAGES.limited : MESSAGES.signIn);
      return ok({ redirectTo: returnTo });
    }
    if (acceptTerms !== true) return fail(400, MESSAGES.terms);
    deps.setCookie("orbis_auth_return_to", returnTo, 3600);
    const { data, error } = await deps.auth.signUp({
      email: address,
      password,
      options: { emailRedirectTo: callback(deps.origin), data: termsData() },
    });
    // An existing address is answered like a new one by Supabase (obfuscated user,
    // no session) when confirmations are on; errors stay generic.
    if (error) return fail(error.status === 429 ? 429 : 400, error.status === 429 ? MESSAGES.limited : MESSAGES.signUp);
    return ok({ redirectTo: returnTo, confirmationRequired: !data.session });
  }

  if (action === "magic-link") {
    if (!options.magicLink) return fail(404, MESSAGES.disabled);
    const parsed = magicLinkSchema.safeParse(raw);
    if (!parsed.success) return fail(400, MESSAGES.invalid);
    const { email: address, intent, acceptTerms } = parsed.data;
    if (intent === "sign-up" && acceptTerms !== true) return fail(400, MESSAGES.terms);
    if (!(await deps.otpLimiter.take(address)).allowed) return fail(429, MESSAGES.limited);
    deps.setCookie("orbis_auth_return_to", returnTo, 3600);
    const { error } = await deps.auth.signInWithOtp({
      email: address,
      options: {
        emailRedirectTo: callback(deps.origin),
        // Only an explicit sign-up (with CGU acceptance) may create an account.
        shouldCreateUser: intent === "sign-up",
        ...(intent === "sign-up" ? { data: termsData() } : {}),
      },
    });
    if (error?.status === 429) return fail(429, MESSAGES.limited);
    // Same answer whether the address exists, is unknown or was refused.
    return ok({ sent: true, message: MESSAGES.sent });
  }

  if (action === "oauth") {
    const parsed = oauthSchema.safeParse(raw);
    if (!parsed.success) return fail(400, MESSAGES.invalid);
    const { provider, intent, acceptTerms } = parsed.data;
    if (!(provider === "google" ? options.google : options.microsoft)) return fail(404, MESSAGES.disabled);
    if (intent === "sign-up" && acceptTerms !== true) return fail(400, MESSAGES.terms);
    deps.setCookie("orbis_auth_return_to", returnTo, 600);
    if (intent === "sign-up") deps.setCookie("orbis_terms_pending", TERMS_VERSION, 600);
    const { data, error } = await deps.auth.signInWithOAuth({
      provider: provider === "google" ? "google" : "azure",
      options: {
        redirectTo: callback(deps.origin),
        skipBrowserRedirect: true,
        // Sign-in identity only: never mailbox scopes (those go through Composio).
        ...(provider === "microsoft" ? { scopes: "email" } : {}),
      },
    });
    if (error || !data.url) return fail(503, MESSAGES.unavailable);
    let url: URL;
    try {
      url = new URL(data.url);
    } catch {
      return fail(503, MESSAGES.unavailable);
    }
    if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && url.protocol === "http:"))
      return fail(503, MESSAGES.unavailable);
    if (url.username || url.password || (deps.providerOrigin && url.origin !== deps.providerOrigin))
      return fail(503, MESSAGES.unavailable);
    return ok({ url: url.toString() });
  }
  return fail(404, "Not found");
}
