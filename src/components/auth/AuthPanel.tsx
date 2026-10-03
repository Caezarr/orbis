"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import type { AuthOptions } from "@/lib/platform/auth";
import s from "./auth.module.css";

type Mode = "sign-up" | "sign-in";
type Method = "magic" | "password";

/**
 * Account creation / sign-in. Methods shown are decided server-side
 * (authOptions): magic link, password, and Google / Microsoft only when the
 * operator declared them configured in Supabase. Creating an account always
 * requires accepting the CGU (checkbox), whatever the method.
 */
export function AuthPanel({
  options,
  returnTo,
  initialMode = "sign-up",
  onSignedIn,
}: {
  options: AuthOptions;
  returnTo: string;
  initialMode?: Mode;
  /** Called after a password sign-in/sign-up that opened a session. */
  onSignedIn?: (redirectTo: string) => void;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [method, setMethod] = useState<Method>(options.magicLink ? "magic" : "password");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const signup = mode === "sign-up";
  const oauth = options.google || options.microsoft;
  const usable = options.magicLink || options.password || oauth;

  async function post(action: string, body: Record<string, unknown>) {
    const response = await fetch(`/api/auth/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, returnTo }),
    });
    const result = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { response, result };
  }
  function guardTerms() {
    if (signup && !accepted) {
      setMessage("Acceptez les conditions générales d’utilisation pour créer un compte.");
      return false;
    }
    return true;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!guardTerms()) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    setNotice("");
    try {
      if (method === "magic") {
        const { response, result } = await post("magic-link", {
          email: form.get("email"),
          intent: mode,
          acceptTerms: signup ? accepted : undefined,
        });
        if (!response.ok) setMessage(String(result.error ?? "Envoi impossible. Réessayez."));
        else setNotice(String(result.message ?? "Lien envoyé."));
        return;
      }
      const { response, result } = await post(mode, {
        email: form.get("email"),
        password: form.get("password"),
        acceptTerms: signup ? accepted : undefined,
      });
      if (!response.ok)
        setMessage(
          response.status === 503
            ? "La connexion n’est pas disponible sur ce déploiement."
            : String(result.error ?? "Connexion impossible. Réessayez."),
        );
      else if (result.confirmationRequired)
        setNotice("Vérifiez votre boîte : un e-mail de confirmation vous ramène ici.");
      else if (onSignedIn) onSignedIn(String(result.redirectTo ?? returnTo));
      else window.location.assign(String(result.redirectTo ?? returnTo));
    } catch {
      setMessage("Connexion au service impossible. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  async function provider(name: "google" | "microsoft") {
    if (!guardTerms()) return;
    setBusy(true);
    setMessage("");
    try {
      const { response, result } = await post("oauth", {
        provider: name,
        intent: mode,
        acceptTerms: signup ? accepted : undefined,
      });
      if (!response.ok || typeof result.url !== "string") {
        setMessage(String(result.error ?? "Connexion impossible. Réessayez."));
        setBusy(false);
        return;
      }
      window.location.assign(result.url);
    } catch {
      setMessage("Connexion au service impossible. Réessayez.");
      setBusy(false);
    }
  }

  if (!usable) return <p className={s.fine}>La connexion n’est pas disponible sur ce déploiement.</p>;
  return (
    <div className={s.panel}>
      <div className={s.switch} role="group" aria-label="Type d’accès">
        <button type="button" aria-pressed={signup} onClick={() => { setMode("sign-up"); setMessage(""); setNotice(""); }}>
          Créer un compte
        </button>
        <button type="button" aria-pressed={!signup} onClick={() => { setMode("sign-in"); setMessage(""); setNotice(""); }}>
          J’ai déjà un compte
        </button>
      </div>

      {signup && (
        <label className={s.consent}>
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} required />
          <span>
            J’accepte les{" "}
            <Link href="/legal/cgu" target="_blank">conditions générales d’utilisation</Link> et j’ai lu la{" "}
            <Link href="/legal/confidentialite" target="_blank">politique de confidentialité</Link>.
          </span>
        </label>
      )}

      {oauth && (
        <div className={s.providers}>
          {options.google && (
            <button type="button" className={s.provider} disabled={busy} onClick={() => provider("google")}>
              Continuer avec Google
            </button>
          )}
          {options.microsoft && (
            <button type="button" className={s.provider} disabled={busy} onClick={() => provider("microsoft")}>
              Continuer avec Microsoft
            </button>
          )}
          <p className={s.fine}>Connexion uniquement : l’accès à votre boîte mail est demandé séparément, à l’étape suivante.</p>
        </div>
      )}

      <form onSubmit={submit} className={s.form}>
        <label>
          E-mail professionnel
          <input name="email" type="email" autoComplete="email" required maxLength={254} />
        </label>
        {method === "password" && (
          <label>
            Mot de passe
            <input
              name="password"
              type="password"
              autoComplete={signup ? "new-password" : "current-password"}
              required
              minLength={signup ? 12 : 1}
              maxLength={1024}
              aria-describedby={signup ? "auth-password-hint" : undefined}
            />
            {signup && (
              <span id="auth-password-hint" className={s.fine}>
                12 caractères minimum.
              </span>
            )}
          </label>
        )}
        {message && (
          <p className={s.alert} role="alert">
            {message}
          </p>
        )}
        {notice && (
          <p className={s.notice} role="status">
            {notice}
          </p>
        )}
        <button className={s.submit} disabled={busy}>
          {busy
            ? "Un instant…"
            : method === "magic"
              ? "Recevoir un lien de connexion"
              : signup
                ? "Créer mon compte"
                : "Me connecter"}
        </button>
        {options.magicLink && options.password && (
          <button
            type="button"
            className={s.link}
            onClick={() => { setMethod(method === "magic" ? "password" : "magic"); setMessage(""); setNotice(""); }}
          >
            {method === "magic" ? "Utiliser un mot de passe" : "Recevoir plutôt un lien par e-mail"}
          </button>
        )}
      </form>
    </div>
  );
}
