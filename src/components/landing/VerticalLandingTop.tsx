"use client";
import Link from "next/link";
import { Check } from "lucide-react";
import { Atmosphere } from "./Optics";
import { TaskWorkshop } from "./MotionScenes";
import { LandingCta } from "./LandingCta";
import { VerticalToolGraph } from "./VerticalToolGraph";
import { parseMotionJobs } from "@/data/verticals/wave1";
import type { VerticalJob } from "@/data/verticals/wave1";
import s from "./company-landing.module.css";

export function VerticalLandingTop(props: {
  enabled: boolean;
  isJobPage: boolean;
  jobLabel: string;
  tagline: string;
  pain: string;
  h2?: string;
  badge?: string;
  icp?: string;
  micro?: string;
  costLines: string[];
  auditUrl: string;
  toolsOrdered: Array<{ src: string; name: string }>;
  workshopJobs: Array<{ input: string; output: string; detail: string }>;
  currentJob: VerticalJob | null;
  hub: string;
  job?: string;
}) {
  const {
    enabled, isJobPage, jobLabel, tagline, pain, h2, badge, icp, micro,
    costLines, auditUrl, toolsOrdered, workshopJobs, currentJob,
  } = props;
  const motionSteps = currentJob ? parseMotionJobs(currentJob.motionJobs) : [];
  return (
    <>
      <div className={s.heroWrap}>
        <Atmosphere enabled={enabled} />
        <section className={s.section} style={{ paddingTop: 44, paddingBottom: 20 }}>
          <div className={s.sectionHeading} style={{ marginBottom: 16 }}>
            {badge && <p style={{ fontSize: 13, color: "#576781", marginBottom: 8, fontWeight: 500 }}>{badge}</p>}
            <h1>{isJobPage ? (currentJob?.h1 || `Install ${jobLabel} into your company.`) : tagline}</h1>
            <p>{h2 || pain}</p>
            {icp && <p style={{ fontSize: 13, color: "#748098", marginTop: 8 }}>{icp}</p>}
            <div style={{ marginTop: 18, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "center" }}>
              <LandingCta href={auditUrl} enabled={enabled} data-cta-audit="hero">Test a mission on my company</LandingCta>
              <Link href="/catalog" style={{ fontSize: 13, color: "#315ee8" }}>Explore 100+ missions</Link>
            </div>
            {micro && <p style={{ fontSize: 12, color: "#8394b1", marginTop: 10 }}>{micro}</p>}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, justifyContent: "center", marginTop: 14, fontSize: 12, color: "#576781" }}>
              <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Check size={14} /> Choose your missions</span>
              <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Check size={14} /> Control the access</span>
              <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Check size={14} /> Review the work</span>
            </div>
          </div>
          {costLines.length > 0 && (
            <div style={{ maxWidth: 720, margin: "8px auto 0", padding: "14px 18px", border: "1px solid #dfe7f3", borderRadius: 12, background: "#fff", textAlign: "center" }}>
              <p style={{ margin: "0 0 8px", fontSize: 14, color: "#182d5b", fontWeight: 500 }}>Solo ~€149/mo proposed vs VA often €2–4k/mo loaded</p>
              <p style={{ margin: "0 0 12px", fontSize: 12, color: "#748098", lineHeight: 1.5 }}>{costLines[0]}</p>
              <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", alignItems: "center" }}>
                <LandingCta href={auditUrl} enabled={enabled} data-cta-audit="pricing-early">Test a mission on my company</LandingCta>
                <Link href="/pricing" style={{ fontSize: 13, color: "#65748d" }}>See pricing</Link>
              </div>
            </div>
          )}
        </section>
      </div>
      <VerticalToolGraph tools={toolsOrdered} enabled={enabled} isJobPage={isJobPage} jobLabel={jobLabel} sectionClassName={s.section} />
      <section className={s.section} style={{ paddingTop: 32, paddingBottom: 24 }}>
        <div className={s.sectionHeading} style={{ marginBottom: 16 }}>
          <h2>{isJobPage ? `${jobLabel} that works.` : "Busywork in. Useful work out."}</h2>
          <p>
            {isJobPage
              ? `Give Orbis the mission and your listing context — get ${jobLabel} with sources, ready for your OK.`
              : "Give Orbis the mission and your listing context. Get a draft with sources — or unknowns called out — ready for your OK."}
          </p>
        </div>
        <div className={s.chapterVisual}>
          <TaskWorkshop enabled={enabled} jobs={workshopJobs.length ? workshopJobs : undefined} />
        </div>
        {isJobPage && motionSteps.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <h3 style={{ fontSize: 17, fontWeight: 500, marginBottom: 12, textAlign: "center" }}>How it works</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, maxWidth: 900, margin: "0 auto" }}>
              {motionSteps.map((step, i) => (
                <div key={i} style={{ padding: 14, border: "1px solid #e2e9f3", borderRadius: 10, background: "#fff" }}>
                  <div style={{ fontSize: 12, color: "#315ee8", marginBottom: 4 }}>Step {i + 1}</div>
                  <div style={{ fontSize: 14, color: "#182d5b", marginBottom: 4 }}>{step.action}</div>
                  <div style={{ fontSize: 12, color: "#748098" }}>{step.result}{step.detail ? ` · ${step.detail}` : ""}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </>
  );
}
