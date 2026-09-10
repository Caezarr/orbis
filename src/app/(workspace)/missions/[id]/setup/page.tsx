"use client";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";
import { useWorkspace } from "@/components/shell/WorkspaceProvider";
import type { Mission, MissionVersion, StoreState } from "@/lib/domain/types";
import styles from "@/components/missions/studio.module.css";

export default function MissionSetupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data, loading, reload } = useWorkspace<StoreState>();
  const mission = data?.missions.find((m) => m.id === id);
  const version = data?.missionVersions.find(
    (v) => v.id === mission?.draftVersionId,
  );
  if (loading) return <p role="status">Opening configuration…</p>;
  if (!data || !mission || !version)
    return (
      <p>
        Mission unavailable. <Link href="/missions">Back to missions</Link>
      </p>
    );
  return (
    <Configuration
      key={version.id}
      data={data}
      mission={mission}
      version={version}
      reload={reload}
    />
  );
}

function Configuration({
  data,
  mission,
  version,
  reload,
}: {
  data: StoreState;
  mission: Mission;
  version: MissionVersion;
  reload: () => Promise<void>;
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState(version.outcome);
  const [instructions, setInstructions] = useState(version.instructions);
  const [selected, setSelected] = useState(
    version.knowledgeSourceIds.filter((id) =>
      data.sources.some(
        (s) =>
          s.id === id &&
          s.tenantId === mission.tenantId &&
          s.status === "ready",
      ),
    ),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/v1/missions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          missionId: mission.id,
          outcome,
          instructions,
          knowledgeSourceIds: selected,
          operatingMode: "test",
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message || "Could not save configuration");
      await reload();
      router.push(`/missions/${mission.id}/lab`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className={styles.studio} style={{ maxWidth: 850 }}>
      <div className={styles.breadcrumb}>
        <Link href={`/missions/${mission.id}/lab`}>
          <ArrowLeft size={14} /> Mission studio
        </Link>
        <span>/</span>
        <span>Configuration</span>
      </div>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>BUILT AROUND YOUR BUSINESS</span>
          <h1>Set the standard.</h1>
          <p>
            Define what good looks like. Choose what the agent knows. Every
            change calls for a fresh evaluation.
          </p>
        </div>
      </header>
      <div className={styles.safety}>
        <ShieldCheck size={17} />
        <span>Test mode · No external tools · No autonomous commitments</span>
      </div>
      {error && (
        <p role="alert" className={styles.notice}>
          {error}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="space-y-5"
      >
        <section className={styles.panel}>
          <div className={styles.sectionTitle}>
            <span className={styles.number}>01</span>
            <h2>The outcome</h2>
          </div>
          <label className={styles.label}>
            What must this mission achieve?
            <textarea
              required
              maxLength={2000}
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              rows={3}
            />
          </label>
        </section>
        <section className={styles.panel}>
          <div className={styles.sectionTitle}>
            <span className={styles.number}>02</span>
            <h2>The knowledge it can use</h2>
          </div>
          <p className={styles.muted}>
            Only selected, ready sources are sent to your provider. Uploaded
            text is evidence, never executable instructions.
          </p>
          <div className="mt-5 space-y-3">
            {data.sources
              .filter((s) => s.tenantId === mission.tenantId)
              .map((source) => (
                <label
                  key={source.id}
                  className="flex items-start gap-3 rounded-xl border border-slate-200 p-4 text-xs"
                >
                  <input
                    className="mt-1 accent-blue-600"
                    type="checkbox"
                    disabled={source.status !== "ready"}
                    checked={selected.includes(source.id)}
                    onChange={(e) =>
                      setSelected((current) =>
                        e.target.checked
                          ? [...current, source.id]
                          : current.filter((id) => id !== source.id),
                      )
                    }
                  />
                  <span className="min-w-0">
                    <strong>{source.name}</strong>
                    <span className="ml-2 text-slate-400">
                      {source.status} · {source.version}
                    </span>
                    <span className="mt-2 block line-clamp-3 leading-6 text-slate-500">
                      {source.excerpt}
                    </span>
                  </span>
                </label>
              ))}
          </div>
          <Link href={`/knowledge/scopes?mission=${encodeURIComponent(mission.id)}`} className={`${styles.textLink} mt-4`}>
            Choisir un dossier SharePoint, Notion ou Drive <ArrowRight size={13} />
          </Link>
          <Link href="/knowledge" className={`${styles.textLink} mt-4`}>
            Add or manage knowledge <ArrowRight size={13} />
          </Link>
        </section>
        <section className={styles.panel}>
          <div className={styles.sectionTitle}>
            <span className={styles.number}>03</span>
            <h2>Your operating instructions</h2>
          </div>
          <label className={styles.label}>
            Tone, constraints, acceptance criteria
            <textarea
              maxLength={8000}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={6}
            />
          </label>
          <p className={styles.fine}>
            Approved mission memory is added separately. Customer-specific
            memory is not enabled without a verified customer identity.
          </p>
        </section>
        <section className={styles.panel}>
          <div className={styles.sectionTitle}>
            <span className={styles.number}>04</span>
            <h2>Execution boundaries</h2>
          </div>
          <p className={styles.muted}>
            Maximum five model calls, 2,400 output tokens per call, one repair
            pass, 150-second overall timeout, no automatic provider retries.
            Provider billing applies even to unsuccessful calls. Euro budgets
            are not yet enforced; configure account-level limits with your
            provider.
          </p>
          <p className={styles.fine}>
            Continuous scheduling, OAuth connectors and external actions require
            a production runtime. This workspace only runs on your explicit
            request.
          </p>
        </section>
        <button
          type="submit"
          className={styles.primary}
          disabled={saving || !selected.length || !outcome.trim()}
        >
          {saving ? "Saving your configuration…" : "Save & open mission studio"}
          <ArrowRight size={16} />
        </button>
        {version.immutable && (
          <p role="alert">
            Saving creates a fresh draft. The previous version stays unchanged.
          </p>
        )}
      </form>
    </div>
  );
}
