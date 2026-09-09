"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/components/shell/WorkspaceProvider";
import { MaturityBadge } from "@/components/ui/MaturityBadge";
import { ProtocolStrip } from "@/components/cards/ProtocolStrip";
import { postJson } from "@/lib/api/client";
import { getCrew } from "@/lib/capabilities/crews";
import type { Mission, StoreState } from "@/lib/domain/types";

export default function CapabilityDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const router = useRouter();
  const { data } = useWorkspace<StoreState>();
  const [busy, setBusy] = useState(false);
  const pkg = data?.packages.find((item) => item.slug === slug);

  if (!data) return <p className="text-muted">Loading…</p>;
  if (!pkg) return <p>Unknown capability.</p>;
  const crew = getCrew(pkg.slug);

  async function start() {
    setBusy(true);
    const created = await postJson<{ mission: Mission }>("/api/v1/missions", { slug });
    router.push(`/missions/${created.mission.id}/setup`);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <p className="text-sm text-muted">
        <Link href="/discover">Discover</Link> / {pkg.name}
      </p>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="serif text-4xl">{pkg.name}</h1>
          <p className="mt-2 max-w-xl text-muted">{pkg.outcome}</p>
          <p className="mt-4 max-w-xl text-sm leading-6">Why now · {crew.whyNow}</p>
        </div>
        <MaturityBadge maturity={pkg.maturity} />
      </div>

      <div className="mt-8">
        <ProtocolStrip slug={pkg.slug} />
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        <Block title="Example result" body={pkg.exampleResult} />
        <Block title="What it needs" body={pkg.requiredKnowledge.join(", ")} />
        <Block title="How it works" body={pkg.protocol.join(" → ")} />
      </div>

      <section className="mt-10 rounded-[14px] border border-line bg-surface p-6">
        <h2 className="font-medium">Your first test</h2>
        <p className="mt-2 text-sm text-muted">{pkg.exampleInput}</p>
        <button
          type="button"
          onClick={() => void start()}
          disabled={busy || pkg.maturity === "planned"}
          className="mt-5 rounded-[10px] bg-ink px-5 py-3 text-sm text-canvas disabled:opacity-40"
        >
          Start test
        </button>
        <p className="mt-4 text-xs text-muted">
          Knowledge used if connected: Company profile, selected sources. External effects: none in test mode.
        </p>
      </section>
    </div>
  );
}

function Block({ title, body }: { title: string; body: string }) {
  return (
    <article className="rounded-[14px] border border-line bg-surface p-5">
      <h2 className="text-sm font-medium">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
    </article>
  );
}
