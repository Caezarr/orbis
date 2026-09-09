"use client";

import { useWorkspace } from "@/components/shell/WorkspaceProvider";
import { formatEuro } from "@/lib/time";
import type { StoreState } from "@/lib/domain/types";

export default function SettingsPage() {
  const { data, loading, reload } = useWorkspace<StoreState>();
  if (loading || !data) return <p className="text-muted">Loading…</p>;

  const usage = data.usage.reduce(
    (acc, entry) => {
      acc[entry.kind] += entry.amountEur;
      return acc;
    },
    { provider: 0, platform: 0, connector: 0, human_review: 0 },
  );

  async function reset() {
    await fetch("/api/v1/workspace", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reset: true }),
    });
    await reload();
  }

  async function download() {
    const res = await fetch("/api/v1/export");
    const json = await res.json();
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "orbis-export.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="serif text-4xl">Settings</h1>

      <section className="mt-8 rounded-[14px] border border-line bg-surface p-5">
        <h2 className="font-medium">Members</h2>
        <ul className="mt-3 text-sm">
          {data.memberships.map((member) => (
            <li key={member.id}>
              {member.name} · {member.email} · {member.role}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-4 rounded-[14px] border border-line bg-surface p-5">
        <h2 className="font-medium">Usage</h2>
        <p className="mt-2 text-sm text-muted">Provider cost and platform fee stay distinguishable.</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>Provider {formatEuro(usage.provider)}</div>
          <div>Platform {formatEuro(usage.platform)}</div>
          <div>Connector {formatEuro(usage.connector)}</div>
          <div>Human review {formatEuro(usage.human_review)}</div>
        </dl>
      </section>

      <section className="mt-4 rounded-[14px] border border-line bg-surface p-5">
        <h2 className="font-medium">Audit</h2>
        <ul className="mt-3 max-h-64 space-y-2 overflow-auto text-sm">
          {data.audit.slice(0, 12).map((event) => (
            <li key={event.id}>
              {event.action} · {event.target} · {event.result}
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" onClick={() => void download()} className="rounded-[10px] bg-ink px-4 py-3 text-sm text-canvas">
          Export configuration
        </button>
        <button type="button" onClick={() => void reset()} className="rounded-[10px] border border-line px-4 py-3 text-sm">
          Reset demo data
        </button>
      </div>
    </div>
  );
}
