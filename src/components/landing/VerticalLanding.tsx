"use client";
import type { FaqItem, VerticalHub, VerticalJob } from "@/data/verticals/types";
import { VerticalShell } from "./VerticalShell";
import { VerticalLandingTop } from "./VerticalLandingTop";
import { VerticalLandingBottom } from "./VerticalLandingBottom";

export type VerticalLandingProps = {
  hub: VerticalHub;
  /** Present on job pages. */
  job?: VerticalJob;
  /** Label of the runtime contract the job runs on (job pages). */
  contractLabel?: string;
  faq: FaqItem[];
  auditHref: string;
};

export function VerticalLanding(props: VerticalLandingProps) {
  return (
    <VerticalShell ctaHref={props.auditHref}>
      <div data-view-vertical={props.job ? `${props.hub.slug}-${props.job.slug}` : props.hub.slug}>
        <VerticalLandingTop {...props} />
        <VerticalLandingBottom {...props} />
      </div>
    </VerticalShell>
  );
}
