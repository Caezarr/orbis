"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useWorkspace } from "@/components/shell/WorkspaceProvider";
import { postJson } from "@/lib/api/client";
import { ProtocolStrip } from "@/components/cards/ProtocolStrip";
import { TracePlayback } from "@/components/cards/TracePlayback";
import type { Artifact, CorrectionScope, EvaluationReport, Run, StoreState } from "@/lib/domain/types";

export default function LabPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, reload, loading } = useWorkspace<StoreState>();
  const mission = data?.missions.find((item) => item.id === id);
  const cases = data?.cases.filter((item) => item.packageSlug === mission?.packageSlug) ?? [];
  const [caseId, setCaseId] = useState(cases[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"case" | "result" | "evidence">("result");
  const [draft, setDraft] = useState("");
  const [scope, setScope] = useState<CorrectionScope>("this_result");
  const [activateMsg, setActivateMsg] = useState("");

  const run = useMemo(() => {
    const list = data?.runs.filter((item) => item.missionId === id) ?? [];
    return list[list.length - 1];
  }, [data, id]);
  const artifact = data?.artifacts.find((item) => item.id === run?.artifactIds[0]);
  const evaluation = data?.evaluations.find((item) => item.id === run?.evaluationId);
  const selectedCase = cases.find((item) => item.id === (caseId || cases[0]?.id));

  if (loading || !data || !mission) return <p className="text-muted">Loading…</p>;

  async function test() {
    setBusy(true);
    setActivateMsg("");
    const result = await postJson<{ run: Run; artifact: Artifact; evaluation: EvaluationReport }>(
      `/api/v1/missions/${id}/test-runs`,
      { caseId: selectedCase?.id, text: selectedCase?.body },
      { "Idempotency-Key": `test-${id}-${Date.now()}` },
    );
    setDraft(result.artifact.body);
    await reload();
    setBusy(false);
  }

  async function saveCorrection() {
    if (!evaluation) return;
    await postJson(`/api/v1/evaluations/${evaluation.id}/feedback`, {
      correction: draft || artifact?.body,
      scope,
      accepted: false,
    });
    await reload();
  }

  async function activate() {
    const res = await fetch(`/api/v1/missions/${id}/activations`, { method: "POST" });
    const json = await res.json();
    if (!json.ok) setActivateMsg(json.blockers?.join(" ") ?? "Activation blocked");
    else setActivateMsg("Supervised mode is active. External writes still wait for a payload-bound approval.");
    await reload();
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">
            <Link href="/missions">Missions</Link> / {mission.name}
          </p>
          <h1 className="serif mt-1 text-3xl">Evaluation lab</h1>
        </div>
        <div className="text-right text-sm text-muted">
          <p>{run ? `Last run ${run.state}` : "No run yet"} · mode {run?.mode ?? "test"}</p>
          {run ? (
            <Link href={`/runs/${run.id}`} className="mt-1 inline-block text-ink">
              Open AMP-style trace →
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mt-6">
        <ProtocolStrip slug={mission.packageSlug} />
      </div>

      <div className="mt-6 md:hidden">
        <div className="flex gap-2">
          {(["case", "result", "evidence"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={`rounded-full px-3 py-1.5 text-xs ${tab === item ? "bg-ink text-canvas" : "border border-line"}`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)_minmax(0,0.9fr)]">
        <aside className={`rounded-[14px] border border-line bg-surface p-4 ${tab === "case" ? "block" : "hidden"} lg:block`}>
          <h2 className="text-xs uppercase tracking-wide text-muted">Case</h2>
          <select
            value={selectedCase?.id ?? ""}
            onChange={(event) => setCaseId(event.target.value)}
            className="mt-3 w-full rounded-[8px] border border-line bg-canvas px-2 py-2 text-sm"
          >
            {cases.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
          <pre className="mt-4 whitespace-pre-wrap text-sm leading-6 text-muted">{selectedCase?.body}</pre>
          <button
            type="button"
            onClick={() => void test()}
            disabled={busy}
            className="mt-4 w-full rounded-[10px] bg-ink py-2.5 text-sm text-canvas"
          >
            {busy ? "Running without side effects…" : "Run test"}
          </button>
        </aside>

        <section className={`rounded-[14px] border border-line bg-surface p-4 ${tab === "result" ? "block" : "hidden"} lg:block`}>
          <h2 className="text-xs uppercase tracking-wide text-muted">Result</h2>
          <textarea
            value={draft || artifact?.body || ""}
            onChange={(event) => setDraft(event.target.value)}
            rows={18}
            className="mt-3 w-full resize-y rounded-[10px] border border-line p-3 text-sm leading-6"
            placeholder="Run a test to see a prepared result."
          />
          <fieldset className="mt-4 text-sm">
            <legend className="text-xs uppercase tracking-wide text-muted">Correction scope</legend>
            {(["this_result", "this_customer", "general_rule"] as CorrectionScope[]).map((item) => (
              <label key={item} className="mt-2 mr-4 inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="scope"
                  checked={scope === item}
                  onChange={() => setScope(item)}
                />
                {item.replace(/_/g, " ")}
              </label>
            ))}
          </fieldset>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => void saveCorrection()} className="rounded-[8px] border border-line px-3 py-2 text-sm">
              Save correction
            </button>
            <button type="button" onClick={() => void test()} className="rounded-[8px] border border-line px-3 py-2 text-sm">
              Run again
            </button>
            <button type="button" onClick={() => void activate()} className="rounded-[8px] bg-ink px-3 py-2 text-sm text-canvas">
              Activate supervised mode
            </button>
          </div>
          {activateMsg ? <p className="mt-3 text-sm text-muted">{activateMsg}</p> : null}
        </section>

        <aside className={`rounded-[14px] border border-line bg-surface p-4 ${tab === "evidence" ? "block" : "hidden"} lg:block`}>
          <h2 className="text-xs uppercase tracking-wide text-muted">Evidence</h2>
          <p className="mt-3 text-sm">{artifact?.citations.length ?? 0} sources used</p>
          <p className="text-sm text-muted">{artifact?.unknowns.length ?? 0} unknowns</p>
          <ul className="mt-4 space-y-3">
            {artifact?.citations.map((cite) => (
              <li key={cite.sourceId} className="text-sm">
                <p className="font-medium">{cite.sourceName}</p>
                <p className="text-muted">{cite.excerpt}</p>
              </li>
            ))}
          </ul>
          <h3 className="mt-6 text-xs uppercase tracking-wide text-muted">Checks</h3>
          <ul className="mt-3 space-y-2">
            {evaluation?.checks.map((check) => (
              <li key={check.id} className="text-sm">
                <span className={check.status === "pass" ? "text-green" : check.status === "warn" ? "text-amber" : "text-red"}>
                  {check.status === "pass" ? "✓" : check.status === "warn" ? "!" : "×"} {check.label}
                </span>
                <p className="text-muted">{check.detail}</p>
              </li>
            ))}
          </ul>
          {run ? (
            <div className="mt-6">
              <p className="text-[11px] uppercase tracking-wide text-muted">Trace · {run.traceId}</p>
              <p className="mt-1 text-xs text-muted">Policy · {run.policyHash}</p>
              <div className="mt-3">
                <TracePlayback steps={run.steps} model={run.model} cost={run.cost} autoPlay />
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
