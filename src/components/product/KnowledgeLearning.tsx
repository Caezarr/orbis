"use client";
import { useState } from "react";
import type { StoreState } from "@/lib/domain/types";
import { resolveApprovedMemory } from "@/lib/knowledge/memory";
import s from "./workspace.module.css";
export function KnowledgeLearning({
  state,
  reload,
}: {
  state: StoreState;
  reload: () => Promise<void>;
}) {
  const [missionId, setMission] = useState(state.missions[0]?.id ?? ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const resolved = resolveApprovedMemory({
    state,
    missionId,
    versionId: state.missions.find((m) => m.id === missionId)?.draftVersionId,
    sourceIds: state.sources.map((v) => v.id),
  });
  const rules = state.memory.filter((m) => m.missionId === missionId),
    used = new Set(resolved.items.map((m) => m.id));
  async function review(id: string, status: string) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/v1/memory/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!r.ok)
        throw new Error(
          "Could not update this rule. An administrator must review it.",
        );
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function propose(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      fields = new FormData(form);
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/v1/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          missionId,
          title: fields.get("title"),
          body: fields.get("body"),
          sourceIds: fields.getAll("sourceIds").filter(Boolean),
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Could not save correction.");
      await reload();
      form.reset();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={s.section}>
      <h2>Make the next result better</h2>
      <p>
        Correct a result, turn the lesson into a rule, then approve it for
        future work. You can withdraw a rule at any time.
      </p>
      <label>
        Mission
        <select value={missionId} onChange={(e) => setMission(e.target.value)}>
          {!state.missions.length && (
            <option value="">Create a mission first</option>
          )}
          {state.missions.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <p>
        {resolved.items.length} rules available for the next run ·{" "}
        {rules.filter((m) => m.status === "proposed").length} awaiting approval
      </p>
      {!!resolved.conflicts.length && (
        <p role="status">
          Some rules disagree under the same title. Withdraw the outdated rule
          to use the right one.
        </p>
      )}
      {rules.map((rule) => (
        <article className={s.source} key={rule.id}>
          <h3>{rule.title}</h3>
          <p>{rule.body}</p>
          <p>
            <small>
              {used.has(rule.id)
                ? "Ready for future runs"
                : rule.status === "approved"
                  ? "Paused: check source version, expiry or a conflicting rule"
                  : rule.status}
            </small>
          </p>
          {rule.sourceRefs?.map((ref) => (
            <p key={ref.sourceId}>
              <small>
                Based on{" "}
                {state.sources.find((v) => v.id === ref.sourceId)?.name ??
                  "Removed source"}{" "}
                · {ref.sourceVersion}
              </small>
            </p>
          ))}
          {rule.status !== "approved" ? (
            <button
              className={s.secondary}
              disabled={busy}
              onClick={() => void review(rule.id, "approved")}
            >
              Approve for this mission
            </button>
          ) : (
            <button
              className={s.secondary}
              disabled={busy}
              onClick={() => void review(rule.id, "rejected")}
            >
              Withdraw rule
            </button>
          )}
          {!!rule.history?.length && (
            <details>
              <summary>History</summary>
              {rule.history.map((h, i) => (
                <p key={i}>
                  {new Date(h.at).toLocaleString()} · {h.status}
                </p>
              ))}
            </details>
          )}
        </article>
      ))}
      <form onSubmit={propose}>
        <h3>Teach Orbi a rule</h3>
        <label>
          What should it remember?
          <input
            name="title"
            required
            maxLength={150}
            placeholder="For example, our cancellation terms"
          />
        </label>
        <label>
          The correction
          <textarea
            name="body"
            required
            minLength={5}
            maxLength={4000}
            rows={4}
            placeholder="Explain what should change in the next result."
          />
        </label>
        <label>
          Supporting source (optional)
          <select name="sourceIds">
            <option value="">A preference without a document</option>
            {state.sources
              .filter(
                (source) =>
                  source.status === "ready" &&
                  state.missionVersions.some(
                    (v) =>
                      v.id ===
                        state.missions.find((m) => m.id === missionId)
                          ?.draftVersionId &&
                      v.knowledgeSourceIds.includes(source.id),
                  ),
              )
              .map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
          </select>
        </label>
        <button className={s.primary} disabled={busy || !missionId}>
          Propose this rule
        </button>
      </form>
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
    </section>
  );
}
