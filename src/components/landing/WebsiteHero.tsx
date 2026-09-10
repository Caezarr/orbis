"use client";
import { useState, useId } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Globe, LoaderCircle, Check } from "lucide-react";
import { LandingCta } from "./LandingCta";
import s from "./website-hero.module.css";
export function WebsiteHero({ compact = false }: { compact?: boolean }) {
  const intakeId = useId();
  const router = useRouter();
  const [mode, setMode] = useState<"site" | "text">("site");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function websiteUrl(input: string) {
    const raw = input.trim();
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const parsed = new URL(candidate);
      if (!parsed.hostname.includes(".") || parsed.hostname.startsWith("."))
        return null;
      return parsed.toString();
    } catch {
      return null;
    }
  }
  async function submit() {
    if (!value.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      if (mode === "site") {
        const website = websiteUrl(value);
        if (!website) {
          setError("Enter a valid website address, like your-company.com.");
          setBusy(false);
          return;
        }
        const r = await fetch("/api/v1/company-site", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ website }),
        });
        const site = await r.json();
        if (!r.ok) throw new Error(site.message);
        sessionStorage.setItem("orbis:site-intake", JSON.stringify(site));
        router.push(`/audit?website=${encodeURIComponent(site.website)}`);
      } else {
        sessionStorage.setItem("orbis:text-intake", value);
        router.push("/audit?from=description");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lecture impossible.");
      setBusy(false);
    }
  }
  return (
    <section
      className={compact ? s.compact : s.hero}
      aria-label={compact ? "Launch your first agents" : undefined}
      aria-labelledby={compact ? undefined : "hero-title"}
    >
      {!compact && <div className={s.geometry} aria-hidden />}
      <div className={s.content}>
        {!compact && (
          <>
            <p className={s.intro}>Your company. Your tools. Your AI team.</p>
            <h1 id="hero-title">
              A bigger business.
              <br />
              Not a bigger to-do list.
            </h1>
            <p className={s.description}>
              AI agents that understand your business and the work you need
              done.
              <br className={s.desktop} /> Start with your website. Choose a
              mission. Make it yours.
            </p>
          </>
        )}
        <form
          className={s.composer}
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label htmlFor={intakeId} className="sr-only">
            {mode === "site" ? "Your company website" : "Describe your company"}
          </label>
          <div className={s.inputRow}>
            {mode === "site" ? (
              <>
                <Globe size={21} />
                <input
                  id={intakeId}
                  disabled={busy}
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    setError("");
                  }}
                  maxLength={2000}
                  placeholder="your-company.com"
                  autoComplete="url"
                  inputMode="url"
                />
              </>
            ) : (
              <textarea
                id={intakeId}
                disabled={busy}
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setError("");
                }}
                maxLength={4000}
                placeholder="We help… and we would like to delegate…"
                rows={3}
              />
            )}
            <LandingCta
              className={s.send}
              type="submit"
              disabled={busy || !value.trim()}
              aria-label={
                busy ? "Reading your website" : "Launch your first agents"
              }
            >
              {busy ? (
                <LoaderCircle size={18} className={s.spin} />
              ) : (
                "Launch your first agents"
              )}
            </LandingCta>
          </div>
          <div className={s.composerBottom}>
            <span>
              {busy
                ? "Reading your public page…"
                : mode === "site"
                  ? "Your website is the starting point. You confirm the context."
                  : "Your own words are enough to get started."}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setMode(mode === "site" ? "text" : "site");
                setValue("");
                setError("");
              }}
            >
              {mode === "site" ? "No website?" : "Use my website"}
            </button>
          </div>
        </form>
        {error && (
          <p className={s.error} role="alert" aria-live="polite">
            {error}
          </p>
        )}
        {!compact && (
          <>
            <div className={s.assurances}>
              <span>
                <Check size={14} /> Choose your missions
              </span>
              <span>
                <Check size={14} /> Control the access
              </span>
              <span>
                <Check size={14} /> Review the work
              </span>
            </div>
            <div className={s.links}>
              <Link href="/catalog">Explore 100+ business missions</Link>
              <Link href="/audit?audience=integrator">
                I help companies build with AI
              </Link>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
