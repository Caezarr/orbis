"use client";

import { useState, type FormEvent } from "react";

export default function LoginPage() {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password"), returnTo: new URLSearchParams(window.location.search).get("returnTo") }),
      });
      const result = await response.json();
      if (!response.ok) setMessage(result.error ?? "Please try again.");
      else if (result.confirmationRequired) setMessage("Check your email to confirm your account, then sign in.");
      else window.location.assign(result.redirectTo ?? "/today");
    } catch { setMessage("Connection failed. Please try again."); }
    finally { setBusy(false); }
  }
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <section className="w-full max-w-sm rounded-2xl border border-black/10 bg-white p-8 shadow-sm">
        <a href="/" className="text-xl font-semibold">Orbis</a>
        <h1 className="mt-8 text-2xl font-semibold">{mode === "sign-in" ? "Welcome back" : "Create your workspace"}</h1>
        <p className="mt-2 text-sm text-black/60">Sign in to your company’s private workspace.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm">Email
            <input name="email" type="email" autoComplete="email" required maxLength={254} className="mt-1 w-full rounded-lg border border-black/20 p-3" />
          </label>
          <label className="block text-sm">Password
            <input name="password" type="password" autoComplete={mode === "sign-in" ? "current-password" : "new-password"} required minLength={mode === "sign-up" ? 12 : 1} maxLength={1024} className="mt-1 w-full rounded-lg border border-black/20 p-3" />
          </label>
          {mode === "sign-up" && <p className="text-xs text-black/60">Use at least 12 characters.</p>}
          <p role="status" aria-live="polite" className="text-sm">{message}</p>
          <button disabled={busy} className="w-full rounded-lg bg-black p-3 text-white disabled:opacity-50">{busy ? "Please wait…" : mode === "sign-in" ? "Sign in" : "Create account"}</button>
        </form>
        <button type="button" disabled={busy} onClick={() => { setMode(mode === "sign-in" ? "sign-up" : "sign-in"); setMessage(""); }} className="mt-5 text-sm underline">{mode === "sign-in" ? "Create an account" : "Already have an account? Sign in"}</button>
      </section>
    </main>
  );
}
