"use client";
import { useState, useSyncExternalStore, useEffect } from "react";
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
import { Atmosphere, LiquidMark } from "./Optics";
import { TaskWorkshop } from "./MotionScenes";
import { LandingCta } from "./LandingCta";
import type { VerticalJob, FaqItem } from "@/data/verticals/wave1";
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

/** Maps display names → public/brand/tools/{src}.svg (home LiquidMark style). */
const TOOL_LOGO: Record<string, { src: string; name: string }> = {
  airbnb: { src: "airbnb", name: "Airbnb" },
  gmail: { src: "gmail", name: "Gmail" },
  whatsapp: { src: "whatsapp", name: "WhatsApp" },
  "google calendar": { src: "googlecalendar", name: "Calendar" },
  googlecalendar: { src: "googlecalendar", name: "Calendar" },
  notion: { src: "notion", name: "Notion" },
  "google docs": { src: "googledocs", name: "Docs" },
  googledocs: { src: "googledocs", name: "Docs" },
  "google sheets": { src: "googlesheets", name: "Sheets" },
  googlesheets: { src: "googlesheets", name: "Sheets" },
  sheets: { src: "googlesheets", name: "Sheets" },
  chrome: { src: "googlechrome", name: "Chrome" },
  "google chrome": { src: "googlechrome", name: "Chrome" },
  googlechrome: { src: "googlechrome", name: "Chrome" },
  drive: { src: "googledrive", name: "Drive" },
  "google drive": { src: "googledrive", name: "Drive" },
  googledrive: { src: "googledrive", name: "Drive" },
  outlook: { src: "microsoftoutlook", name: "Outlook" },
  "microsoft outlook": { src: "microsoftoutlook", name: "Outlook" },
  microsoftoutlook: { src: "microsoftoutlook", name: "Outlook" },
  hubspot: { src: "hubspot", name: "HubSpot" },
  salesforce: { src: "salesforce", name: "Salesforce" },
  slack: { src: "slack", name: "Slack" },
};

function resolveTool(raw: string): { src: string | null; name: string } {
  const key = raw.trim().toLowerCase();
  const hit = TOOL_LOGO[key];
  if (hit) return hit;
  return { src: null, name: raw.trim() };
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
  faq?: FaqItem[];
  workshopJobs?: Array<{ input: string; output: string; detail: string }>;
  /** Explicit ToolGraph list (hub motion.json / hubMeta.tools). */
  tools?: string[];
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
  faq = [],
  workshopJobs = [],
  tools: toolsProp,
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

  useEffect(() => {
    if (Object.keys(utm).length > 0) persistUtms(utm);
  }, [utm]);

  const auditParams: Record<string, string> = { vertical: hub };
  if (job) auditParams.job = job;

  const utmWithContent = { ...utm };
  if (!utmWithContent.utm_content) {
    utmWithContent.utm_content = job ? `${hub}-${job}` : hub;
  }
  const auditUrl = buildUrlWithUtm("/audit", utmWithContent, auditParams);
  const motionSteps = currentJob ? parseMotionJobs(currentJob.motionJobs) : [];

  const rawTools: string[] = [];
  if (toolsProp && toolsProp.length > 0) {
    rawTools.push(...toolsProp);
  } else if (isJobPage && currentJob) {
    rawTools.push(...parseTools(currentJob.tools));
  } else {
    jobs.forEach((j) => parseTools(j.tools).forEach((t) => rawTools.push(t)));
  }
  const seen = new Set<string>();
  const toolsOrdered: Array<{ src: string | null; name: string }> = [];
  for (const raw of rawTools) {
    const t = resolveTool(raw);
    const key = t.src || t.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    toolsOrdered.push(t);
    if (toolsOrdered.length >= 6) break;
  }

  return (
    <div
      className={s.root}
      data-motion={enabled}
      data-view-vertical={`${hub}${job ? `-${job}` : ""}`}
    >
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
          <section
            className={s.section}
            style={{ paddingTop: "44px", paddingBottom: "20px" }}
          >
            <div className={s.sectionHeading} style={{ marginBottom: "16px" }}>
              {badge && (
                <p
                  style={{
                    fontSize: "13px",
                    color: "#576781",
                    marginBottom: "8px",
                    fontWeight: 500,
                  }}
                >
                  {badge}
                </p>
              )}
              <h1>
                {isJobPage
                  ? currentJob?.h1 || `Install ${jobLabel} into your company.`
                  : tagline}
              </h1>
              <p>{h2 || pain}</p>
              {icp && (
                <p
                  style={{
                    fontSize: "13px",
                    color: "#748098",
                    marginTop: "8px",
                  }}
                >
                  {icp}
                </p>
              )}
              <div
                style={{
                  marginTop: "18px",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "12px",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <LandingCta
                  href={auditUrl}
                  enabled={enabled}
                  data-cta-audit="hero"
                >
                  Test a mission on my company
                </LandingCta>
                <Link
                  href="/catalog"
                  style={{ fontSize: "13px", color: "#315ee8" }}
                >
                  Explore 100+ missions
                </Link>
              </div>
              {micro && (
                <p
                  style={{
                    fontSize: "12px",
                    color: "#8394b1",
                    marginTop: "10px",
                  }}
                >
                  {micro}
                </p>
              )}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "14px",
                  justifyContent: "center",
                  marginTop: "14px",
                  fontSize: "12px",
                  color: "#576781",
                }}
              >
                <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <Check size={14} /> Choose your missions
                </span>
                <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <Check size={14} /> Control the access
                </span>
                <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <Check size={14} /> Review the work
                </span>
              </div>
            </div>

            {/* Pricing early — Solo vs VA */}
            {costLines.length > 0 && (
              <div
                style={{
                  maxWidth: 720,
                  margin: "8px auto 0",
                  padding: "14px 18px",
                  border: "1px solid #dfe7f3",
                  borderRadius: 12,
                  background: "#fff",
                  textAlign: "center",
                }}
              >
                <p
                  style={{
                    margin: "0 0 8px",
                    fontSize: 14,
                    color: "#182d5b",
                    fontWeight: 500,
                  }}
                >
                  Solo ~€149/mo proposed vs VA often €2–4k/mo loaded
                </p>
                <p
                  style={{
                    margin: "0 0 12px",
                    fontSize: 12,
                    color: "#748098",
                    lineHeight: 1.5,
                  }}
                >
                  {costLines[0]}
                </p>
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    justifyContent: "center",
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <LandingCta
                    href={auditUrl}
                    enabled={enabled}
                    data-cta-audit="pricing-early"
                  >
                    Test a mission on my company
                  </LandingCta>
                  <Link
                    href="/pricing"
                    style={{ fontSize: 13, color: "#65748d" }}
                  >
                    See pricing
                  </Link>
                </div>
              </div>
            )}
          </section>
        </div>

        <section
          className={s.section}
          style={{ paddingTop: "32px", paddingBottom: "24px" }}
        >
          <div className={s.sectionHeading} style={{ marginBottom: "16px" }}>
            <h2>
              {isJobPage
                ? `${jobLabel} that works.`
                : "Busywork in. Useful work out."}
            </h2>
            <p>
              {isJobPage
                ? `A late check-in. A review sitting unanswered. Give Orbis the mission and your listing context — get ${jobLabel} with sources, ready for your OK.`
                : "A late check-in. A review sitting unanswered. A listing that needs a seasonal rewrite. Give Orbis the mission and your listing context. Get a draft with sources — or unknowns called out — ready for your OK."}
            </p>
          </div>
          <div className={s.chapterVisual}>
            <TaskWorkshop
              enabled={enabled}
              jobs={workshopJobs.length ? workshopJobs : undefined}
            />
          </div>

          {isJobPage && motionSteps.length > 0 && (
            <div style={{ marginTop: "24px" }}>
              <h3
                style={{
                  fontSize: "17px",
                  fontWeight: 500,
                  marginBottom: "12px",
                  textAlign: "center",
                }}
              >
                How it works
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: "10px",
                  maxWidth: "900px",
                  margin: "0 auto",
                }}
              >
                {motionSteps.map((step, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "14px",
                      border: "1px solid #e2e9f3",
                      borderRadius: "10px",
                      background: "#fff",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#315ee8",
                        marginBottom: "4px",
                      }}
                    >
                      Step {i + 1}
                    </div>
                    <div
                      style={{
                        fontSize: "14px",
                        color: "#182d5b",
                        marginBottom: "4px",
                      }}
                    >
                      {step.action}
                    </div>
                    <div style={{ fontSize: "12px", color: "#748098" }}>
                      {step.result}
                      {step.detail ? ` · ${step.detail}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {toolsOrdered.length > 0 && (
          <section
            className={s.section}
            style={{ paddingTop: "24px", paddingBottom: "24px" }}
          >
            <div className={s.sectionHeading} style={{ marginBottom: "14px" }}>
              <h2>Your tools. Working together.</h2>
              <p>
                Homepage-style marks for the tools this pack uses. Each
                connector still needs verified access.
              </p>
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "24px",
                justifyContent: "center",
                alignItems: "flex-end",
              }}
            >
              {toolsOrdered.map((tool) =>
                tool.src ? (
                  <div
                    key={tool.name}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <LiquidMark
                      enabled={enabled}
                      running={enabled}
                      src={`/brand/tools/${tool.src}.svg`}
                      size={88}
                    />
                    <small
                      style={{
                        fontSize: "12px",
                        color: "#65748d",
                        fontWeight: 500,
                      }}
                    >
                      {tool.name}
                    </small>
                  </div>
                ) : (
                  <div
                    key={tool.name}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "8px",
                      minWidth: 72,
                    }}
                  >
                    <div
                      style={{
                        width: 72,
                        height: 72,
                        borderRadius: 16,
                        border: "1px solid #e2e9f3",
                        background: "#f7f9ff",
                        display: "grid",
                        placeItems: "center",
                        fontSize: 18,
                        fontWeight: 600,
                        color: "#315ee8",
                      }}
                      aria-hidden
                    >
                      {tool.name.slice(0, 1)}
                    </div>
                    <small
                      style={{
                        fontSize: "12px",
                        color: "#65748d",
                        fontWeight: 500,
                      }}
                    >
                      {tool.name}
                    </small>
                  </div>
                )
              )}
            </div>
          </section>
        )}

        {!isJobPage && jobs.length > 0 && (
          <section
            className={s.section}
            style={{ paddingTop: "24px", paddingBottom: "24px" }}
          >
            <div className={s.sectionHeading} style={{ marginBottom: "14px" }}>
              <h2>Missions in this pack</h2>
              <p>Each mission is one clear task. Start with what hurts this week.</p>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
                gap: "10px",
              }}
            >
              {jobs.map((j) => (
                <Link
                  key={j.job}
                  href={`/for/${hub}/${j.job}`}
                  style={{
                    padding: "16px",
                    border: "1px solid #dfe7f3",
                    borderRadius: "12px",
                    background: "#fff",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <h3 style={{ fontSize: "16px", fontWeight: 500, margin: 0 }}>
                    {getJobLabel(j.job)}
                  </h3>
                  <p
                    style={{
                      fontSize: "13px",
                      color: "#748098",
                      margin: 0,
                      flex: 1,
                    }}
                  >
                    {j.h2?.slice(0, 110) ||
                      parseMotionJobs(j.motionJobs)[0]?.action ||
                      "Mission ready"}
                    {(j.h2?.length || 0) > 110 ? "…" : ""}
                  </p>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "12px",
                      color: "#315ee8",
                    }}
                  >
                    Test on my company <ArrowRight size={14} />
                  </div>
                </Link>
              ))}
            </div>
            <div style={{ textAlign: "center", marginTop: "18px" }}>
              <LandingCta
                href={auditUrl}
                enabled={enabled}
                data-cta-audit="missions"
              >
                Test a mission on my company
              </LandingCta>
            </div>
          </section>
        )}

        {isJobPage && siblingJobs.length > 0 && (
          <section
            className={s.section}
            style={{ paddingTop: "20px", paddingBottom: "20px" }}
          >
            <div className={s.sectionHeading} style={{ marginBottom: "10px" }}>
              <h2>More missions for {hubLabel}</h2>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {siblingJobs
                .filter((j) => j.job !== job)
                .slice(0, 4)
                .map((j) => (
                  <Link
                    key={j.job}
                    href={`/for/${hub}/${j.job}`}
                    style={{
                      padding: "10px 14px",
                      border: "1px solid #e2e9f3",
                      borderRadius: "9px",
                      background: "#fff",
                      fontSize: "13px",
                      color: "#182d5b",
                      textDecoration: "none",
                    }}
                  >
                    {getJobLabel(j.job)}
                  </Link>
                ))}
            </div>
            <div style={{ marginTop: "12px" }}>
              <Link
                href={`/for/${hub}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "13px",
                  color: "#315ee8",
                }}
              >
                See all {hubLabel} missions <ArrowRight size={14} />
              </Link>
            </div>
          </section>
        )}

        {valueStack.length > 0 && (
          <section
            className={s.section}
            style={{ paddingTop: "24px", paddingBottom: "24px" }}
          >
            <div className={s.sectionHeading} style={{ marginBottom: "12px" }}>
              <h2>
                Why this beats another ChatGPT tab
                <br />
                <span style={{ fontSize: "0.85em", fontWeight: 400 }}>
                  (and a €2–4k VA slice)
                </span>
              </h2>
            </div>
            <ul
              style={{
                maxWidth: 720,
                margin: "0 auto",
                paddingLeft: 18,
                color: "#576781",
                lineHeight: 1.55,
              }}
            >
              {valueStack.map((item) => (
                <li key={item} style={{ marginBottom: 8 }}>
                  {item}
                </li>
              ))}
            </ul>
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <LandingCta
                href={auditUrl}
                enabled={enabled}
                data-cta-audit="value"
              >
                Test a mission on my company
              </LandingCta>
            </div>
          </section>
        )}

        {faq.length > 0 && (
          <section
            className={s.section}
            style={{ paddingTop: "24px", paddingBottom: "24px" }}
          >
            <div className={s.sectionHeading} style={{ marginBottom: "12px" }}>
              <h2>A few things worth knowing</h2>
            </div>
            <div style={{ maxWidth: 720, margin: "0 auto" }}>
              {faq.map((item) => (
                <div key={item.q} style={{ marginBottom: 14 }}>
                  <h3
                    style={{
                      fontSize: 15,
                      fontWeight: 500,
                      margin: "0 0 4px",
                      color: "#182d5b",
                    }}
                  >
                    {item.q}
                  </h3>
                  <p
                    style={{
                      fontSize: 14,
                      color: "#576781",
                      margin: 0,
                      lineHeight: 1.55,
                    }}
                  >
                    {item.a}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className={s.finalCta}>
          <div className={s.ctaOrb}>
            <LiquidMark enabled={enabled} size={145} />
          </div>
          <h2>
            {finalH2 ||
              `Run the audit on your ${hubLabel} company.`}
          </h2>
          <p>
            {isJobPage
              ? `Test ${jobLabel} on your listings. First result to review — nothing posts without you.`
              : "Run the audit on your Airbnb hosting company. First mission. First result to review."}
          </p>
          <LandingCta
            href={auditUrl}
            enabled={enabled}
            data-cta-audit="final"
          >
            Test a mission on my company
          </LandingCta>
          <Link href="/catalog">Browse the catalog</Link>
        </section>

        <section
          className={s.section}
          style={{
            borderTop: "1px solid #e2e9f3",
            paddingTop: "24px",
            paddingBottom: "16px",
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "#8394b1",
              textAlign: "center",
            }}
          >
            <p style={{ marginBottom: 12 }}>More from Orbis</p>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 16,
                justifyContent: "center",
              }}
            >
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
            Work you supervise.
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
          <Link href="/connections">Tools & access</Link>
          <Link href="/today">Your workspace</Link>
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
