"use client";

import { useState, type FormEvent } from "react";
import styles from "./login.module.css";

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
  const signup = mode === "sign-up";
  return <main className={styles.page}>
    <section className={styles.formPane}>
      <a href="/" className={styles.brand}><span aria-hidden="true"/>Orbis</a>
      <div>
        <div className={styles.switch} role="group" aria-label="Account mode">
          <button type="button" aria-pressed={!signup} onClick={() => {setMode("sign-in");setMessage("");}}>Sign in</button>
          <button type="button" aria-pressed={signup} onClick={() => {setMode("sign-up");setMessage("");}}>Sign up</button>
        </div>
        <h1>{signup ? "Build your company’s extra capacity." : "Welcome back to Orbis."}</h1>
        <p>{signup ? "Give Orbis a little context. Your workspace takes shape as you go." : "Your company’s work is ready when you are."}</p>
        <form onSubmit={submit} className={styles.form}>
          <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
          <label>Password<input name="password" type="password" autoComplete={signup ? "new-password" : "current-password"} required minLength={signup ? 12 : 1} maxLength={1024} /></label>
          {signup && <span className={styles.fine}>Use at least 12 characters.</span>}
          <p role="status" aria-live="polite" className={styles.message}>{message}</p>
          <button disabled={busy} className={styles.submit}>{busy ? "Setting things up…" : signup ? "Create my workspace" : "Sign in to Orbis"}</button>
        </form>
      </div>
    </section>
    <aside className={styles.preview} aria-label="Live workspace preview">
      <div className={styles.previewInner}>
        <div className={styles.orb} aria-hidden="true" />
        <p className={styles.previewLead}>Your company, in motion.</p>
        <h2>{signup ? <>A workspace that <em>learns</em> with you.</> : <>The work is waiting. <em>Orbi is ready.</em></>}</h2>
        <p className={styles.previewLead}>Describe a need, choose a mission, and review useful work.</p>
        <div className={styles.mock}>
          <div className={styles.mockTop}><span className={styles.dot}/><span>Today</span><span style={{marginLeft:"auto"}}>Your workspace</span></div>
          <div className={styles.mockRow}><div><strong>{signup ? "Understanding your company" : "Prepare a first result"}</strong><br/><small>{signup ? "Building your context" : "Ready to review"}</small></div><span>→</span></div>
          <div className={styles.mockRow}><div><strong>Knowledge</strong><br/><small>Sources and approved memory</small></div><span>03</span></div>
          <div className={styles.mockRow}><div><strong>Agents</strong><br/><small>Focused on the work that matters</small></div><span>+</span></div>
        </div>
      </div>
    </aside>
  </main>;
}
