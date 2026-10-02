"use client";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { toolRole } from "@/data/verticals/tools";
import { Atmosphere } from "./Optics";
import { TaskWorkshop } from "./MotionScenes";
import { LandingCta } from "./LandingCta";
import { VerticalToolGraph } from "./VerticalToolGraph";
import { useShellMotion } from "./VerticalShell";
import type { VerticalLandingProps } from "./VerticalLanding";
import s from "./company-landing.module.css";
import v from "./vertical-landing.module.css";

export function VerticalLandingTop({
  hub,
  job,
  contractLabel,
  auditHref,
}: VerticalLandingProps) {
  const enabled = useShellMotion();
  return (
    <>
      <div className={s.heroWrap}>
        <Atmosphere enabled={enabled} />
        <section className={`${s.section} ${v.hero}`}>
          <p className={v.eyebrow}>
            {job ? `${hub.label} · ${job.label}` : `Orbis for ${hub.label}`}
          </p>
          <h1>{job ? job.title : hub.title}</h1>
          <p className={v.lead}>{job ? job.summary : hub.lead}</p>
          <p className={v.fit}>{job ? job.fit : hub.fit}</p>
          <div className={v.actions}>
            <LandingCta href={auditHref} enabled={enabled}>
              Test a mission on my company
            </LandingCta>
            <Link href="/catalog" className={v.textLink}>
              Browse the mission catalogue
            </Link>
          </div>
          <div className={v.checks}>
            <span>
              <Check size={14} /> Choose your sources
            </span>
            <span>
              <Check size={14} /> Review every draft
            </span>
            <span>
              <Check size={14} /> You send, publish or decide
            </span>
          </div>
          {job && contractLabel && (
            <p className={v.status}>
              <strong>Draft preparation</strong> Runs on the {contractLabel}{" "}
              mission contract, in test mode
            </p>
          )}
        </section>
      </div>

      {job ? (
        <section className={`${s.section} ${v.compact}`}>
          <div className={v.centerHeading}>
            <h2>What {job.label.toLowerCase()} needs and returns</h2>
          </div>
          <div className={v.spec}>
            <div className={v.specCard}>
              <h3>What you give it</h3>
              <ul>
                {job.inputs.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
            <div className={v.specCard}>
              <h3>What the draft contains</h3>
              <ul>
                {job.draft.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
            <div className={v.specCard}>
              <h3>What it will not do</h3>
              <ul>
                {job.boundaries.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : (
        <section className={`${s.section} ${v.compact}`} id="missions">
          <div className={v.centerHeading}>
            <h2>Missions for {hub.label}</h2>
            <p>{hub.intro}</p>
          </div>
          <div className={v.jobGrid}>
            {hub.jobs.map((j) => (
              <Link
                key={j.slug}
                href={`/for/${hub.slug}/${j.slug}`}
                className={v.jobCard}
              >
                <h3>{j.label}</h3>
                <p>{j.summary}</p>
                <span>
                  What it needs and returns <ArrowRight size={14} />
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className={`${s.section} ${v.compact}`}>
        <div className={v.centerHeading}>
          <h2>One task in. A draft to review.</h2>
          <p>
            Each run reads only the sources you select, prepares the draft and
            checks it before you see it. Gaps are listed, not filled with
            guesses.
          </p>
        </div>
        <div className={s.chapterVisual}>
          <TaskWorkshop
            enabled={enabled}
            jobs={job ? job.steps : hub.workshop}
          />
        </div>
      </section>

      {job ? (
        <VerticalToolGraph
          sectionClassName={s.section}
          heading="Relevant connections"
          intro="Connections that help with this mission today, and what you paste yourself."
          tools={job.connections}
          pasteOnly={job.pasteOnly}
        />
      ) : (
        <VerticalToolGraph
          sectionClassName={s.section}
          heading="Works next to the tools you keep"
          intro="What can be connected today, and what stays copy and paste."
          tools={hub.tools.map((tool) => ({ tool, use: toolRole(tool) }))}
          note={hub.toolsNote}
        />
      )}
    </>
  );
}
