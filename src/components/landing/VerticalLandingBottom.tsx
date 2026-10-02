"use client";
import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { LiquidMark } from "./Optics";
import { LandingCta } from "./LandingCta";
import { useShellMotion } from "./VerticalShell";
import type { VerticalLandingProps } from "./VerticalLanding";
import s from "./company-landing.module.css";
import v from "./vertical-landing.module.css";

export function VerticalLandingBottom({
  hub,
  job,
  faq,
  auditHref,
}: VerticalLandingProps) {
  const enabled = useShellMotion();
  const siblings = job ? hub.jobs.filter((j) => j.slug !== job.slug) : [];
  return (
    <>
      {!job && hub.principles.length > 0 && (
        <section className={`${s.section} ${v.compact}`}>
          <div className={v.centerHeading}>
            <h2>What stays true on every mission</h2>
          </div>
          <ul className={v.principles}>
            {hub.principles.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>
      )}

      {faq.length > 0 && (
        <section className={`${s.section} ${s.faq}`}>
          <h2>A few things worth knowing.</h2>
          <div>
            {faq.map((f) => (
              <details key={f.q}>
                <summary>
                  {f.q}
                  <ChevronDown size={17} />
                </summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      {siblings.length > 0 && (
        <section className={`${s.section} ${v.compact}`}>
          <div className={v.centerHeading}>
            <h2>More missions for {hub.label}</h2>
          </div>
          <div className={v.siblings}>
            {siblings.map((j) => (
              <Link key={j.slug} href={`/for/${hub.slug}/${j.slug}`}>
                {j.label}
              </Link>
            ))}
          </div>
          <div className={v.centerLink}>
            <Link href={`/for/${hub.slug}`}>
              Orbis for {hub.label} <ArrowRight size={14} />
            </Link>
          </div>
        </section>
      )}

      <section className={s.finalCta}>
        <div className={s.ctaOrb}>
          <LiquidMark enabled={enabled} size={145} />
        </div>
        <h2>{hub.finalTitle}</h2>
        <p>
          Sign in, describe your company and test a first mission. The result
          comes back as a draft for your review.
        </p>
        <LandingCta href={auditHref} enabled={enabled}>
          Test a mission on my company
        </LandingCta>
        <Link href={job ? `/for/${hub.slug}` : "/for"}>
          {job ? `All ${hub.label} missions` : "All industries"}
        </Link>
      </section>
    </>
  );
}
