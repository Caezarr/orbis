"use client";
import { useState, useSyncExternalStore, useEffect, type CSSProperties } from "react";
import Link from "next/link";
import Image from "next/image";
import { useReducedMotion } from "motion/react";
import {
  ArrowUpRight,
  ArrowRight,
  Menu,
  X,
  Check,
} from "lucide-react";
import { WebsiteHero } from "./WebsiteHero";
import { Atmosphere, LiquidMark, useVisibleMotion } from "./Optics";
import { TaskWorkshop } from "./MotionScenes";
import { LandingCta } from "./LandingCta";
import type { VerticalJob } from "@/data/verticals/wave1";
import { parseMotionJobs, parseTools, getJobLabel } from "@/data/verticals/wave1";
import type { UtmParams } from "@/lib/visual/utm";
import { buildUrlWithUtm, persistUtms } from "@/lib/visual/utm";
import s from "./company-landing.module.css";

function Mark({ small = false }: { small?: boolean }) {
  return (
    <Image
      src="/brand/orbis-mark.svg"
      width={small ? 25 : 36}
      height={small ? 25 : 36}
      alt=""
    />
  );
}

interface VerticalLandingProps {
  type: "hub" | "job";
  hub: string;
  hubLabel: string;
  tagline: string;
  pain: string;
  h2?: string;
  badge?: string;
  icp?: string;
  micro?: string;
  finalH2?: string;
  valueStack?: string[];
  costLines?: string[];
  workshopJobs?: Array<{ input: string; output: string; detail: string }>;
  job?: string;
  jobs: VerticalJob[];
  siblingJobs?: VerticalJob[];
  utm: UtmParams;
}

const subscribeHydration = () => () => {};

export function VerticalLanding({
  type,
  hub,
  hubLabel,
  tagline,
  pain,
  h2,
  badge,
  icp,
  micro,
  finalH2,
  valueStack = [],
  costLines = [],
  workshopJobs = [],
  job,
  jobs,
  siblingJobs = [],
  utm,
}: VerticalLandingProps) {
  const reduced = useReducedMotion();
  const [quiet, setQuiet] = useState(false);
  const [menu, setMenu] = useState(false);
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false
  );
  const enabled = hydrated && reduced === false && !quiet;

  const isJobPage = type === "job";
  const currentJob = isJobPage && job ? jobs.find((j) => j.job === job) : null;
  const jobLabel = job ? getJobLabel(job) : "";

  // Persist UTMs on mount
  useEffect(() => {
    if (Object.keys(utm).length > 0) {
      persistUtms(utm);
    }
  }, [utm]);

  // Build audit CTA URL with UTM params
  const auditParams: Record<string, string> = {
    vertical: hub,
  };
  if (job) {
    auditParams.job = job;
  }
  
  // Build utm_content from hub-job or hub
  const utmWithContent = { ...utm };
  if (!utmWithContent.utm_content) {
    utmWithContent.utm_content = job ? `${hub}-${job}` : hub;
  }
  
  const auditUrl = buildUrlWithUtm("/audit", utmWithContent, auditParams);

  // Motion jobs for the current job (if job page)
  const motionSteps = currentJob ? parseMotionJobs(currentJob.motionJobs) : [];

  // Tools for ToolGraph section
  const displayJobs = isJobPage && currentJob ? [currentJob] : jobs.slice(0, 3);
  const allTools = new Set<string>();
  displayJobs.forEach((j) => {
    parseTools(j.tools).forEach((t) => allTools.add(t));
  });
  const toolsList = Array.from(allTools).slice(0, 6);

  return (
    <div className={s.root} data-motion={enabled} data-view-vertical={`${hub}${job ? `-${job}` : ''}`}>
      <a href="#main" className={s.skip}>
        Skip to content
      </a>
      <header className={s.nav}>
        <Link href="/" className={s.brand} aria-label="Orbis home">
          <Mark />
          Orbis
        </Link>
        <nav className={s.desktopNav} aria-label="Main navigation">
          <Link href="/for">Verticals</Link>
          <Link href="/catalog">100+ missions</Link>
          <Link href="/pricing">Pricing</Link>
        </nav>
        <div className={s.navActions}>
          <Link className={s.login} href="/today">
            Login
          </Link>
          <LandingCta href={auditUrl} enabled={enabled} data-cta-audit="nav">
            Test a mission on my company
          </LandingCta>
          <button
            className={s.menuToggle}
            aria-label="Toggle navigation"
            aria-expanded={menu}
            onClick={() => setMenu((v) => !v)}
          >
            {menu ? <X /> : <Menu />}
          </button>
        </div>
      </header>

      {menu && (
        <nav className={s.mobileNav} aria-label="Mobile navigation">
          {[
            { href: "/for", text: "Verticals" },
            { href: "/catalog", text: "100+ missions" },
            { href: "/pricing", text: "Pricing" },
          ].map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setMenu(false)}>
              {l.text}
              <ArrowUpRight size={15} />
            </Link>
          ))}
        </nav>
      )}

      <main id="main">
        <div className={s.heroWrap}>
          <Atmosphere enabled={enabled} />
          <section className={`${s.section}`} style={{ paddingTop: "70px", paddingBottom: "60px" }}>
            <div className={s.sectionHeading} style={{ marginBottom: "50px" }}>
              {badge && (
                <p style={{ fontSize: "12px", color: "#65748d", marginBottom: "14px" }}>
                  {badge}
                </p>
              )}
              <h1>
                {isJobPage
                  ? `Install ${jobLabel} into your company.`
                  : tagline}
              </h1>
              <p>{h2 || pain}</p>
              {icp && (
                <p style={{ fontSize: "13px", color: "#748098", marginTop: "12px" }}>
                  {icp}
                </p>
              )}
              <div style={{ marginTop: "30px" }}>
                <LandingCta href={auditUrl} enabled={enabled} data-cta-audit="hero">
                  Test a mission on my company
                </LandingCta>
              </div>
              {micro && (
                <p style={{ fontSize: "12px", color: "#8394b1", marginTop: "14px" }}>
                  {micro}
                </p>
              )}
            </div>
          </section>
        </div>

        {/* Motion Section */}
        <section className={s.section} style={{ paddingTop: "60px" }}>
          <div className={s.sectionHeading}>
            <h2>
              {isJobPage
                ? `${jobLabel} that works.`
                : "The busywork, handled."}
            </h2>
            <p>
              {isJobPage
                ? `Stop stitching together ChatGPT tabs. Give Orbis the context it needs — your house rules, your client history, your brand voice — and get ${jobLabel} you can actually use.`
                : "Stop stitching together ChatGPT tabs. Give Orbis the context it needs and get work you can actually use."}
            </p>
          </div>
          <div className={s.chapterVisual}>
            <TaskWorkshop enabled={enabled} jobs={workshopJobs.length ? workshopJobs : undefined} />
          </div>

          {/* Motion steps for job pages */}
          {isJobPage && motionSteps.length > 0 && (
            <div style={{ marginTop: "50px", textAlign: "center" }}>
              <h3 style={{ fontSize: "24px", fontWeight: "500", marginBottom: "30px" }}>
                How it works
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "20px", maxWidth: "900px", margin: "0 auto" }}>
                {motionSteps.map((step, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "24px",
                      border: "1px solid #e2e9f3",
                      borderRadius: "12px",
                      background: "#fff",
                    }}
                  >
                    <div style={{ fontSize: "13px", color: "#315ee8", marginBottom: "12px" }}>
                      Step {i + 1}
                    </div>
                    <div style={{ fontSize: "14px", color: "#182d5b", marginBottom: "8px" }}>
                      {step.action}
                    </div>
                    <div style={{ fontSize: "12px", color: "#748098" }}>
                      → {step.result}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Jobs list for hub pages */}
        {!isJobPage && jobs.length > 0 && (
          <section className={s.section}>
            <div className={s.sectionHeading}>
              <h2>Missions built for {hubLabel}</h2>
              <p>
                Each mission handles one clear task. Pick what matters to you.
              </p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "20px" }}>
              {jobs.map((j) => (
                <Link
                  key={j.job}
                  href={`/for/${hub}/${j.job}`}
                  style={{
                    padding: "28px",
                    border: "1px solid #dfe7f3",
                    borderRadius: "14px",
                    background: "#fff",
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                    textDecoration: "none",
                    color: "inherit",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = "0 8px 24px #263f6510";
                    e.currentTarget.style.transform = "translateY(-2px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = "none";
                    e.currentTarget.style.transform = "none";
                  }}
                >
                  <h3 style={{ fontSize: "18px", fontWeight: "500", margin: "0" }}>
                    {getJobLabel(j.job)}
                  </h3>
                  <p style={{ fontSize: "13px", color: "#748098", margin: "0", flex: "1" }}>
                    {parseMotionJobs(j.motionJobs)[0]?.action || "Mission ready to deploy"}
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "#315ee8" }}>
                    Test a mission <ArrowRight size={14} />
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Sibling jobs for job pages */}
        {isJobPage && siblingJobs.length > 0 && (
          <section className={s.section}>
            <div className={s.sectionHeading}>
              <h2>More missions for {hubLabel}</h2>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "15px" }}>
              {siblingJobs
                .filter((j) => j.job !== job)
                .slice(0, 4)
                .map((j) => (
                  <Link
                    key={j.job}
                    href={`/for/${hub}/${j.job}`}
                    style={{
                      padding: "16px 20px",
                      border: "1px solid #e2e9f3",
                      borderRadius: "9px",
                      background: "#fff",
                      fontSize: "13px",
                      color: "#182d5b",
                      textDecoration: "none",
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "#315ee8";
                      e.currentTarget.style.background = "#f7f9ff";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "#e2e9f3";
                      e.currentTarget.style.background = "#fff";
                    }}
                  >
                    {getJobLabel(j.job)}
                  </Link>
                ))}
            </div>
            <div style={{ marginTop: "30px" }}>
              <Link
                href={`/for/${hub}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "10px",
                  fontSize: "13px",
                  color: "#315ee8",
                }}
              >
                See all {hubLabel} missions <ArrowRight size={14} />
              </Link>
            </div>
          </section>
        )}

        {/* Tools */}
        {toolsList.length > 0 && (
          <section className={s.section}>
            <div className={s.sectionHeading}>
              <h2>Works with your tools.</h2>
              <p>
                Connects to the services you already use.{" "}
                {isJobPage ? `For ${jobLabel}, that means:` : ""}
              </p>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "35px", justifyContent: "center" }}>
              {toolsList.map((tool) => {
                const toolKey = tool.toLowerCase().replace(/\s+/g, "");
                return (
                  <div
                    key={tool}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      fontSize: "14px",
                      color: "#65748d",
                      fontWeight: "500",
                    }}
                  >
                    <Image
                      src={`/brand/tools/${toolKey}.svg`}
                      alt=""
                      width={28}
                      height={28}
                      style={{ objectFit: "contain" }}
                    />
                    {tool}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {valueStack.length > 0 && (
          <section className={s.section}>
            <div className={s.sectionHeading}>
              <h2>What this pack replaces on a bad week.</h2>
            </div>
            <ul style={{ maxWidth: "720px", margin: "0 auto", paddingLeft: "20px", color: "#576781", lineHeight: 1.7 }}>
              {valueStack.map((item) => (
                <li key={item} style={{ marginBottom: "10px" }}>{item}</li>
              ))}
            </ul>
          </section>
        )}

        {costLines.length > 0 && (
          <section className={s.section}>
            <div className={s.sectionHeading}>
              <h2>What you pay today for the same capacity.</h2>
            </div>
            <ul style={{ maxWidth: "720px", margin: "0 auto", paddingLeft: "20px", color: "#576781", lineHeight: 1.7 }}>
              {costLines.map((item) => (
                <li key={item} style={{ marginBottom: "10px" }}>{item}</li>
              ))}
            </ul>
          </section>
        )}

        {/* Pricing — muted only, unique CTA stays audit */}
        <section className={s.section} id="pricing">
          <div className={s.sectionHeading}>
            <h2>Transparent pricing.</h2>
            <p>
              Solo plan at ~€149/month indicative (includes platform, basic usage).
              <br />
              Virtual assistant or in-house hire: €2–4k/month loaded cost.
            </p>
            <small>
              Indicative pricing · final scope and availability confirmed before
              any subscription.
            </small>
          </div>
          <div style={{ textAlign: "center", marginTop: "40px" }}>
            <Link href="/pricing" style={{ fontSize: "13px", color: "#65748d", textDecoration: "underline" }}>
              See pricing details
            </Link>
          </div>
        </section>

        {/* CTA */}
        <section className={s.finalCta}>
          <div className={s.ctaOrb}>
            <LiquidMark enabled={enabled} size={145} />
          </div>
          <h2>
            {finalH2 ||
              (isJobPage
                ? `Run the audit on your ${hubLabel} company.`
                : `Run the audit on your ${hubLabel} company.`)}
          </h2>
          <p>
            {isJobPage
              ? `Test ${jobLabel} on your company. See what Orbis can do.`
              : `Test your first mission. See what Orbis can do.`}
          </p>
          <LandingCta href={auditUrl} enabled={enabled} data-cta-audit="final">
            Test a mission on my company
          </LandingCta>
          <Link href="/catalog">Browse the catalog</Link>
        </section>

        {/* Maillage */}
        <section className={s.section} style={{ borderTop: "1px solid #e2e9f3", paddingTop: "40px" }}>
          <div style={{ fontSize: "11px", color: "#8394b1", textAlign: "center" }}>
            <p style={{ marginBottom: "20px" }}>More from Orbis</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", justifyContent: "center" }}>
              {!isJobPage && (
                <Link href="/for" style={{ color: "#7790b9" }}>
                  All verticals
                </Link>
              )}
              {isJobPage && (
                <Link href={`/for/${hub}`} style={{ color: "#7790b9" }}>
                  All {hubLabel} missions
                </Link>
              )}
              <Link href="/catalog" style={{ color: "#7790b9" }}>
                Mission catalog
              </Link>
              <Link href="/pricing" style={{ color: "#7790b9" }}>
                Pricing
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className={s.footer}>
        <div>
          <Link href="/" className={s.brand}>
            <Mark />
            Orbis
          </Link>
          <p>
            Your company. Your tools.
            <br />
            Your AI team.
          </p>
        </div>
        <div>
          <span>Explore</span>
          <Link href="/catalog">Mission catalogue</Link>
          <Link href="/audit">Company audit</Link>
          <Link href="/pricing">Pricing & usage</Link>
        </div>
        <div>
          <span>Build with Orbis</span>
          <Link href="/audit?audience=integrator">For integrators</Link>
          <Link href="/today">Your workspace</Link>
          <Link href="/connections">Tools & access</Link>
        </div>
        <div className={s.footerBottom}>
          <span>© {new Date().getFullYear()} Orbis</span>
          <label className={s.motionPreference}>
            Motion{" "}
            <select
              aria-label="Motion preference"
              value={quiet ? "reduced" : "system"}
              onChange={(e) => setQuiet(e.target.value === "reduced")}
            >
              <option value="system">Automatic</option>
              <option value="reduced">Reduced</option>
            </select>
          </label>
        </div>
      </footer>
    </div>
  );
}
