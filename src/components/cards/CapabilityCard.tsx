import Link from "next/link";
import type { CapabilityPackage } from "@/lib/domain/types";
import { MaturityBadge } from "@/components/ui/MaturityBadge";
import { getCrew } from "@/lib/capabilities/crews";

export function CapabilityCard({
  pkg,
  href,
  action,
  whyNow,
}: {
  pkg: CapabilityPackage;
  href?: string;
  action?: string;
  whyNow?: string;
}) {
  const reason = whyNow ?? getCrew(pkg.slug).whyNow;
  const inner = (
    <article className="flex h-full flex-col rounded-[14px] border border-line bg-surface p-5 transition hover:border-ink/20">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">{pkg.category}</p>
        <MaturityBadge maturity={pkg.maturity} />
      </div>
      <h3 className="mt-3 text-lg font-medium tracking-tight">{pkg.name}</h3>
      <p className="mt-2 flex-1 text-sm leading-6 text-muted">{pkg.outcome}</p>
      <p className="mt-4 text-sm leading-6 text-ink">Why now · {reason}</p>
      <p className="mt-3 text-xs text-muted">First test · {pkg.testTime} · no external effects</p>
      <div className="mt-4 text-sm font-medium text-ink">{action ?? "See details →"}</div>
    </article>
  );
  if (!href) return inner;
  return (
    <Link href={href} className="block h-full">
      {inner}
    </Link>
  );
}
