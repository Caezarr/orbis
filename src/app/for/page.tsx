import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { VerticalShell } from "@/components/landing/VerticalShell";
import { auditHref, hubs } from "@/data/verticals";
import { SITE_URL } from "@/lib/site";
import s from "@/components/landing/company-landing.module.css";
import v from "@/components/landing/vertical-landing.module.css";

const title = "Orbis by Industry: Missions for Hosts, Creators and Coaches";
const description =
  "Bounded AI missions for Airbnb hosts, content creators, and coaches and consultants. Orbis prepares drafts from the sources you select; you review and decide what goes out.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/for` },
  openGraph: { type: "website", siteName: "Orbis", url: `${SITE_URL}/for`, title, description },
};

export default function ForIndexPage() {
  return (
    <VerticalShell ctaHref={auditHref()}>
      <section className={`${s.section} ${v.hero}`}>
        <p className={v.eyebrow}>Orbis by industry</p>
        <h1>Missions shaped around your kind of work.</h1>
        <p className={v.lead}>
          Pick your industry to see the recurring tasks Orbis can prepare, what
          each one needs from you, and where it stops.
        </p>
      </section>
      <section className={`${s.section} ${v.compact}`}>
        <div className={v.hubGrid}>
          {hubs.map((hub) => (
            <Link key={hub.slug} href={`/for/${hub.slug}`} className={v.hubCard}>
              <h2>{hub.label}</h2>
              <p>{hub.teaser}</p>
              <div className={v.hubCardFoot}>
                <span>
                  {hub.jobs.length} {hub.jobs.length === 1 ? "mission" : "missions"}
                </span>
                <span>
                  Explore <ArrowRight size={14} />
                </span>
              </div>
            </Link>
          ))}
        </div>
        <div className={v.indexCta}>
          <h2>Don’t see your industry?</h2>
          <p>The mission catalogue covers sales, marketing, support, finance, operations and more.</p>
          <div className={v.actions}>
            <Link href="/catalog" className={v.textLink}>
              Browse the mission catalogue
            </Link>
          </div>
        </div>
      </section>
    </VerticalShell>
  );
}
