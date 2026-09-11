"use client";
import { useState, useSyncExternalStore, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useReducedMotion } from "motion/react";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { LandingCta } from "./LandingCta";
import { buildToolsOrdered } from "./VerticalToolGraph";
import { VerticalLandingTop } from "./VerticalLandingTop";
import { VerticalLandingBottom } from "./VerticalLandingBottom";
import type { VerticalJob, FaqItem } from "@/data/verticals/wave1";
import { parseTools, getJobLabel } from "@/data/verticals/wave1";
import type { UtmParams } from "@/lib/visual/utm";
import { buildUrlWithUtm, persistUtms } from "@/lib/visual/utm";
import s from "./company-landing.module.css";

function Mark({ small = false }: { small?: boolean }) {
  return (
    <Image src="/brand/orbis-mark.svg" width={small ? 25 : 36} height={small ? 25 : 36} alt="" />
  );
}

const subscribeHydration = () => () => {};

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
  tools?: string[];
  job?: string;
  jobs: VerticalJob[];
  siblingJobs?: VerticalJob[];
  utm: UtmParams;
}

export function VerticalLanding({
  type, hub, hubLabel, tagline, pain, h2, badge, icp, micro, finalH2,
  valueStack = [], costLines = [], faq = [], workshopJobs = [],
  tools: toolsProp, job, jobs, siblingJobs = [], utm,
}: VerticalLandingProps) {
  const reduced = useReducedMotion();
  const [quiet, setQuiet] = useState(false);
  const [menu, setMenu] = useState(false);
  const hydrated = useSyncExternalStore(subscribeHydration, () => true, () => false);
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
  if (!utmWithContent.utm_content) utmWithContent.utm_content = job ? `${hub}-${job}` : hub;
  const auditUrl = buildUrlWithUtm("/audit", utmWithContent, auditParams);

  const rawTools: string[] = [];
  if (toolsProp?.length) rawTools.push(...toolsProp);
  else if (isJobPage && currentJob) rawTools.push(...parseTools(currentJob.tools));
  else jobs.forEach((j) => parseTools(j.tools).forEach((t) => rawTools.push(t)));
  const toolsOrdered = buildToolsOrdered(rawTools, isJobPage);

  return (
    <div className={s.root} data-motion={enabled} data-view-vertical={`${hub}${job ? `-${job}` : ""}`}>
      <a href="#main" className={s.skip}>Skip to content</a>
      <header className={s.nav}>
        <Link href="/" className={s.brand} aria-label="Orbis home"><Mark />Orbis</Link>
        <nav className={s.desktopNav} aria-label="Main navigation">
          <Link href="/for">Verticals</Link>
          <Link href="/catalog">100+ missions</Link>
          <Link href="/pricing">Pricing</Link>
        </nav>
        <div className={s.navActions}>
          <Link className={s.login} href="/today">Login</Link>
          <LandingCta href={auditUrl} enabled={enabled} data-cta-audit="nav">Test a mission on my company</LandingCta>
          <button className={s.menuToggle} aria-label="Toggle navigation" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
            {menu ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      {menu && (
        <nav className={s.mobileNav} aria-label="Mobile navigation">
          {[{ href: "/for", text: "Verticals" }, { href: "/catalog", text: "100+ missions" }, { href: "/pricing", text: "Pricing" }].map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setMenu(false)}>{l.text}<ArrowUpRight size={15} /></Link>
          ))}
        </nav>
      )}
      <main id="main">
        <VerticalLandingTop
          enabled={enabled}
          isJobPage={isJobPage}
          jobLabel={jobLabel}
          tagline={tagline}
          pain={pain}
          h2={h2}
          badge={badge}
          icp={icp}
          micro={micro}
          costLines={costLines}
          auditUrl={auditUrl}
          toolsOrdered={toolsOrdered}
          workshopJobs={workshopJobs}
          currentJob={currentJob || null}
          hub={hub}
          job={job}
        />
        <VerticalLandingBottom
          enabled={enabled}
          isJobPage={isJobPage}
          hub={hub}
          hubLabel={hubLabel}
          job={job}
          jobLabel={jobLabel}
          jobs={jobs}
          siblingJobs={siblingJobs}
          valueStack={valueStack}
          faq={faq}
          finalH2={finalH2}
          auditUrl={auditUrl}
        />
      </main>
      <footer className={s.footer}>
        <div>
          <Link href="/" className={s.brand}><Mark />Orbis</Link>
          <p>Your company. Your tools.<br />Work you supervise.</p>
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
            <select aria-label="Motion preference" value={quiet ? "reduced" : "system"} onChange={(e) => setQuiet(e.target.value === "reduced")}>
              <option value="system">Automatic</option>
              <option value="reduced">Reduced</option>
            </select>
          </label>
        </div>
      </footer>
    </div>
  );
}
