"use client";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LiquidMark } from "./Optics";
import { LandingCta } from "./LandingCta";
import { getJobLabel } from "@/data/verticals/wave1";
import type { VerticalJob, FaqItem } from "@/data/verticals/wave1";
import s from "./company-landing.module.css";

export function VerticalLandingBottom(props: {
  enabled: boolean;
  isJobPage: boolean;
  hub: string;
  hubLabel: string;
  job?: string;
  jobLabel: string;
  jobs: VerticalJob[];
  siblingJobs: VerticalJob[];
  valueStack: string[];
  faq: FaqItem[];
  finalH2?: string;
  auditUrl: string;
}) {
  const {
    enabled, isJobPage, hub, hubLabel, job, jobLabel, jobs, siblingJobs,
    valueStack, faq, finalH2, auditUrl,
  } = props;
  return (
    <>
      {!isJobPage && jobs.length > 0 && (
        <section className={s.section} style={{ paddingTop: 24, paddingBottom: 24 }}>
          <div className={s.sectionHeading} style={{ marginBottom: 14 }}>
            <h2>Missions in this pack</h2>
            <p>Each mission is one clear task. Start with what hurts this week.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 10 }}>
            {jobs.map((j) => (
              <Link key={j.job} href={`/for/${hub}/${j.job}`} style={{ padding: 16, border: "1px solid #dfe7f3", borderRadius: 12, background: "#fff", display: "flex", flexDirection: "column", gap: 6, textDecoration: "none", color: "inherit" }}>
                <h3 style={{ fontSize: 16, fontWeight: 500, margin: 0 }}>{getJobLabel(j.job)}</h3>
                <p style={{ fontSize: 13, color: "#748098", margin: 0, flex: 1 }}>
                  {(j.h2 || "").slice(0, 110)}{(j.h2?.length || 0) > 110 ? "…" : ""}
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#315ee8" }}>Test on my company <ArrowRight size={14} /></div>
              </Link>
            ))}
          </div>
          <div style={{ textAlign: "center", marginTop: 18 }}>
            <LandingCta href={auditUrl} enabled={enabled} data-cta-audit="missions">Test a mission on my company</LandingCta>
          </div>
        </section>
      )}

      {isJobPage && siblingJobs.length > 0 && (
        <section className={s.section} style={{ paddingTop: 20, paddingBottom: 20 }}>
          <div className={s.sectionHeading} style={{ marginBottom: 10 }}><h2>More missions for {hubLabel}</h2></div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {siblingJobs.filter((j) => j.job !== job).slice(0, 4).map((j) => (
              <Link key={j.job} href={`/for/${hub}/${j.job}`} style={{ padding: "10px 14px", border: "1px solid #e2e9f3", borderRadius: 9, background: "#fff", fontSize: 13, color: "#182d5b", textDecoration: "none" }}>
                {getJobLabel(j.job)}
              </Link>
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <Link href={`/for/${hub}`} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: "#315ee8" }}>
              See all {hubLabel} missions <ArrowRight size={14} />
            </Link>
          </div>
        </section>
      )}

      {valueStack.length > 0 && (
        <section className={s.section} style={{ paddingTop: 24, paddingBottom: 24 }}>
          <div className={s.sectionHeading} style={{ marginBottom: 12 }}>
            <h2>Why this beats another ChatGPT tab<br /><span style={{ fontSize: "0.85em", fontWeight: 400 }}>(and a €2–4k VA slice)</span></h2>
          </div>
          <ul style={{ maxWidth: 720, margin: "0 auto", paddingLeft: 18, color: "#576781", lineHeight: 1.55 }}>
            {valueStack.map((item) => <li key={item} style={{ marginBottom: 8 }}>{item}</li>)}
          </ul>
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <LandingCta href={auditUrl} enabled={enabled} data-cta-audit="value">Test a mission on my company</LandingCta>
          </div>
        </section>
      )}

      {faq.length > 0 && (
        <section className={s.section} style={{ paddingTop: 24, paddingBottom: 24 }}>
          <div className={s.sectionHeading} style={{ marginBottom: 12 }}><h2>A few things worth knowing</h2></div>
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            {faq.map((item) => (
              <div key={item.q} style={{ marginBottom: 14 }}>
                <h3 style={{ fontSize: 15, fontWeight: 500, margin: "0 0 4px", color: "#182d5b" }}>{item.q}</h3>
                <p style={{ fontSize: 14, color: "#576781", margin: 0, lineHeight: 1.55 }}>{item.a}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className={s.finalCta}>
        <div className={s.ctaOrb}><LiquidMark enabled={enabled} size={145} /></div>
        <h2>{finalH2 || `Run the audit on your ${hubLabel} company.`}</h2>
        <p>
          {isJobPage
            ? `Test ${jobLabel} on your listings. First result to review — nothing posts without you.`
            : "Run the audit on your Airbnb hosting company. First mission. First result to review."}
        </p>
        <LandingCta href={auditUrl} enabled={enabled} data-cta-audit="final">Test a mission on my company</LandingCta>
        <Link href="/catalog">Browse the catalog</Link>
      </section>

      <section className={s.section} style={{ borderTop: "1px solid #e2e9f3", paddingTop: 24, paddingBottom: 16 }}>
        <div style={{ fontSize: 11, color: "#8394b1", textAlign: "center" }}>
          <p style={{ marginBottom: 12 }}>More from Orbis</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "center" }}>
            {!isJobPage && <Link href="/for" style={{ color: "#7790b9" }}>All verticals</Link>}
            {isJobPage && <Link href={`/for/${hub}`} style={{ color: "#7790b9" }}>All {hubLabel} missions</Link>}
            <Link href="/catalog" style={{ color: "#7790b9" }}>Mission catalog</Link>
            <Link href="/pricing" style={{ color: "#7790b9" }}>Pricing</Link>
          </div>
        </div>
      </section>
    </>
  );
}
