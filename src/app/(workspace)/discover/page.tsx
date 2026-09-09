"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useWorkspace } from "@/components/shell/WorkspaceProvider";
import { CapabilityCard } from "@/components/cards/CapabilityCard";
import { recommendSlugs } from "@/lib/runtime/recommend";
import type { Maturity, StoreState } from "@/lib/domain/types";

const FILTERS: Array<{ id: string; label: string; maturity?: Maturity }> = [
  { id: "all", label: "All" },
  { id: "ready", label: "Ready to test", maturity: "ready" },
  { id: "composable", label: "Composable", maturity: "composable" },
  { id: "planned", label: "Planned", maturity: "planned" },
];

export default function DiscoverPage() {
  const { data, loading } = useWorkspace<StoreState>();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");

  const recs = useMemo(() => {
    if (!data) return [];
    return recommendSlugs(data.profile)
      .map((slug) => data.packages.find((pkg) => pkg.slug === slug))
      .filter(Boolean);
  }, [data]);

  const items = useMemo(() => {
    if (!data) return [];
    const selected = FILTERS.find((item) => item.id === filter);
    return data.packages.filter((pkg) => {
      const blob = `${pkg.name} ${pkg.outcome} ${pkg.category} ${pkg.roles.join(" ")}`.toLowerCase();
      if (q && !blob.includes(q.toLowerCase())) return false;
      if (selected?.maturity && pkg.maturity !== selected.maturity) return false;
      return true;
    });
  }, [data, q, filter]);

  if (loading || !data) return <p className="text-muted">Loading…</p>;

  return (
    <div className="mx-auto max-w-5xl">
      <p className="text-sm text-muted">Good morning, {data.memberships[0]?.name}</p>
      <h1 className="serif mt-1 text-4xl">Tell us how your company works</h1>
      <form className="mt-6" action="/discover/request">
        <label htmlFor="need" className="sr-only">
          Describe a need
        </label>
        <div className="flex items-center gap-2 rounded-[14px] border border-line bg-surface p-2">
          <input
            id="need"
            name="q"
            placeholder="Paste your website or describe the work you want delegated"
            className="h-12 flex-1 bg-transparent px-3 outline-none"
          />
          <Link
            href="/discover/request"
            className="rounded-[10px] bg-ink px-4 py-3 text-sm text-canvas"
          >
            Continue
          </Link>
        </div>
      </form>

      {(data.signals ?? []).length > 0 ? (
        <section className="mt-10">
          <h2 className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Signals · why now</h2>
          <ul className="mt-3 grid gap-3 md:grid-cols-3">
            {data.signals.map((signal) => (
              <li key={signal.id}>
                <Link href={`/discover/${signal.slug}`} className="block rounded-[14px] border border-line bg-surface p-4">
                  <p className="text-xs text-muted">{signal.evidence}</p>
                  <p className="mt-2 font-medium">{signal.title}</p>
                  <p className="mt-2 text-sm leading-6 text-muted">{signal.whyNow}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <h2 className="mt-12 text-sm font-medium">We found enough context to suggest a starting point</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {recs.map((pkg) =>
          pkg ? (
            <CapabilityCard
              key={pkg.slug}
              pkg={pkg}
              href={`/discover/${pkg.slug}`}
              action={pkg.maturity === "ready" ? "Try this" : "See details"}
            />
          ) : null,
        )}
      </div>

      <div className="mt-12 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-medium">Marketplace</h2>
        <Link href="/discover/request" className="text-sm text-muted hover:text-ink">
          Describe another need
        </Link>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search by outcome, role, tool…"
          className="h-10 rounded-[8px] border border-line bg-surface px-3 text-sm"
        />
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={`rounded-full px-3 py-1.5 text-xs ${
              filter === item.id ? "bg-ink text-canvas" : "border border-line text-muted"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {items.map((pkg) => (
          <CapabilityCard key={pkg.slug} pkg={pkg} href={`/discover/${pkg.slug}`} />
        ))}
      </div>
    </div>
  );
}
