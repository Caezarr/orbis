"use client";
import { useState, useId } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Globe, LoaderCircle } from "lucide-react";
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
        const params = new URLSearchParams(window.location.search);
        const campaign = params.get("utm_campaign");
        const auditUrl = `/audit?website=${encodeURIComponent(site.website)}${campaign ? `&utm_campaign=${campaign}` : ""}`;
        router.push(auditUrl);
      } else {
        sessionStorage.setItem("orbis:text-intake", value);
        const params = new URLSearchParams(window.location.search);
        const campaign = params.get("utm_campaign");
        const auditUrl = `/audit?from=description${campaign ? `&utm_campaign=${campaign}` : ""}`;
        router.push(auditUrl);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lecture impossible.");
      setBusy(false);
    }
  }
  return (
    <section
      className={compact ? s.compact : s.hero}
      aria-label={compact ? "Test a mission on my company" : undefined}
      aria-labelledby={compact ? undefined : "hero-title"}
    >
      {!compact && <div className={s.geometry} aria-hidden />}
      <div className={s.content}>
        {!compact && (
          <>
            <p className={s.intro}>MVP: website intake, missions, evaluated runs. OAuth and outside execution: soon.</p>
            <h1 id="hero-title">
              Install work into your company.
            </h1>
            <p className={s.description}>
              You already paste context into ChatGPT. Orbis turns one repeating job into a bounded mission on <em>your</em> company: test the result, check sources and unknowns, activate under supervision.
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
            {mode === "site" ? "Your website" : "Describe your company"}
          </label>
          <div className={s.inputRow}>
            {mode === "site" ? (
              <>
                <Globe size={21} />
                <input
                  className={s.intakeInput}
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
                className={s.intakeInput}
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
                busy ? "Reading your website" : "Test a mission on my company"
              }
              data-cta="audit"
            >
              {busy ? (
                <LoaderCircle size={18} className={s.spin} />
              ) : (
                "Test a mission on my company"
              )}
            </LandingCta>
          </div>
          <div className={s.composerBottom}>
            <span>
              {busy
                ? "Reading your public page…"
                : mode === "site"
                  ? "Website or 4 questions. First deliverable to review. Nothing acts outside without you."
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
              {mode === "site" ? "No website? Describe the company" : "Use my website"}
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
            <p className={s.disqualify}>
              For founders and ops in growing teams. Not a hobby toy. Not an enterprise RFP kit.
            </p>
            <div className={s.links}>
              <Link href="/catalog" className={s.mutedLink}>Browse the catalog</Link>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
