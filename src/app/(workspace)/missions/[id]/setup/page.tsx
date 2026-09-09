"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useWorkspace } from "@/components/shell/WorkspaceProvider";
import { ProtocolStrip } from "@/components/cards/ProtocolStrip";
import { getPackage } from "@/lib/capabilities/registry";
import type { RuntimeMode, StoreState } from "@/lib/domain/types";

export default function MissionSetupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { data, reload } = useWorkspace<StoreState>();
  const mission = data?.missions.find((item) => item.id === id);
  const version = data?.missionVersions.find((item) => item.id === mission?.draftVersionId);
  const pkg = mission ? getPackage(mission.packageSlug) : undefined;
  const [instructions, setInstructions] = useState(version?.instructions ?? "");
  const [budget, setBudget] = useState(version?.budgetEur ?? 0.5);
  const [mode, setMode] = useState<RuntimeMode>(version?.operatingMode ?? "test");
  const [selected, setSelected] = useState<string[]>(version?.knowledgeSourceIds ?? []);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (version) {
      setInstructions(version.instructions);
      setBudget(version.budgetEur);
      setMode(version.operatingMode);
      setSelected(version.knowledgeSourceIds);
    }
  }, [version]);

  if (!data || !mission || !version || !pkg) return <p className="text-muted">Loading…</p>;
  const missionId = mission.id;
  const missionName = mission.name;

  async function save() {
    setSaving(true);
    await fetch("/api/v1/missions", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        missionId,
        instructions,
        budgetEur: budget,
        operatingMode: mode,
        knowledgeSourceIds: selected,
      }),
    });
    await reload();
    setSaving(false);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm text-muted">
        <Link href="/missions">Missions</Link> / {missionName}
      </p>
      <h1 className="serif mt-2 text-4xl">Configure this mission</h1>
      <p className="mt-2 text-muted">Six sections. Start the test when blocking requirements are complete. The crew is a protocol, not a canvas.</p>

      <div className="mt-6">
        <ProtocolStrip slug={pkg.slug} />
      </div>

      <Section n="1" title="Outcome">
        <p>{version.outcome}</p>
      </Section>
      <Section n="2" title="Knowledge">
        <ul className="space-y-2">
          {data.sources.map((source) => (
            <li key={source.id}>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(source.id)}
                  onChange={(event) => {
                    setSelected((current) =>
                      event.target.checked ? [...current, source.id] : current.filter((id) => id !== source.id),
                    );
                  }}
                />
                <span>
                  <span className="font-medium">{source.name}</span>
                  <span className="block text-muted">{source.excerpt}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </Section>
      <Section n="3" title="Instructions">
        <textarea
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          rows={5}
          className="w-full rounded-[10px] border border-line p-3"
        />
      </Section>
      <Section n="4" title="Tools">
        <p className="text-sm text-muted">{version.tools.join(" · ")}</p>
        <p className="mt-2 text-xs text-muted">Writes are denied in test mode by the tool broker.</p>
      </Section>
      <Section n="5" title="Operating mode">
        <div className="flex flex-wrap gap-2">
          {(["test", "supervised", "scoped_autonomy"] as RuntimeMode[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setMode(item)}
              className={`rounded-full px-3 py-1.5 text-xs ${
                mode === item ? "bg-ink text-canvas" : "border border-line"
              }`}
            >
              {item.replace("_", " ")}
            </button>
          ))}
        </div>
      </Section>
      <Section n="6" title="Budget and approvals">
        <label className="text-sm">
          Reservation
          <input
            type="number"
            step="0.01"
            value={budget}
            onChange={(event) => setBudget(Number(event.target.value))}
            className="ml-3 w-24 rounded-[8px] border border-line px-2 py-1"
          />{" "}
          EUR
        </label>
        <p className="mt-2 text-xs text-muted">Policy: {version.approvalPolicy.replace(/_/g, " ")}</p>
      </Section>

      <div className="mt-8 flex gap-3">
        <button
          type="button"
          onClick={() => void save()}
          className="rounded-[10px] border border-line px-4 py-3 text-sm"
        >
          {saving ? "Saving…" : "Save draft"}
        </button>
        <button
          type="button"
          onClick={async () => {
            await save();
            router.push(`/missions/${missionId}/lab`);
          }}
          className="rounded-[10px] bg-ink px-4 py-3 text-sm text-canvas"
        >
          Start test
        </button>
        <Link href={`/missions/${missionId}/expert`} className="px-4 py-3 text-sm text-muted">
          Expert mode
        </Link>
      </div>
    </div>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 rounded-[14px] border border-line bg-surface p-5">
      <h2 className="text-sm font-medium">
        {n}. {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
