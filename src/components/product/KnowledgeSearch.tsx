"use client";

import { useRef, useState } from "react";
import type { StoreState } from "@/lib/domain/types";
import type { KnowledgeEvidence } from "@/lib/knowledge";
import { accessibleSources } from "@/lib/knowledge/retrieval";
import s from "./workspace.module.css";

export function KnowledgeSearch({ state }: { state: StoreState }) {
  const [query, setQuery] = useState("");
  const [missionId, setMissionId] = useState("");
  const [selection, setSelection] = useState<string[] | null>(null);
  const [result, setResult] = useState<{
    key: string;
    items: KnowledgeEvidence[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const sources = accessibleSources({
    state,
    sourceIds: state.sources.map((s) => s.id),
    missionId: missionId || undefined,
  });
  const sourceIds = sources
    .filter((s) => selection === null || selection.includes(s.id))
    .map((s) => s.id);
  const key = JSON.stringify([
    query,
    missionId,
    sourceIds,
    sources.map((s) => [s.id, s.version, s.excerpt]),
  ]);
  const items = result?.key === key ? result.items : null;

  async function search(event: React.FormEvent) {
    event.preventDefault();
    const requestId = ++sequence.current;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/v1/knowledge-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          sourceIds,
          missionId: missionId || undefined,
          limit: 8,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.message ?? data.error ?? "Search unavailable. Try again.",
        );
      if (sequence.current === requestId) setResult({ key, items: data.items });
    } catch (e) {
      if (sequence.current === requestId)
        setError(e instanceof Error ? e.message : "Search unavailable.");
    } finally {
      if (sequence.current === requestId) setBusy(false);
    }
  }

  return (
    <section className={s.section} aria-labelledby="knowledge-search-title">
      <h2 id="knowledge-search-title">Search your knowledge</h2>
      <p>
        Find matching words in ready source content. Folder selections awaiting
        a connection are not searchable.
      </p>
      <form onSubmit={search}>
        <label>
          Mission scope
          <select
            value={missionId}
            onChange={(e) => {
              setMissionId(e.target.value);
              setSelection(null);
            }}
          >
            <option value="">Workspace sources</option>
            {state.missions
              .filter(
                (m) =>
                  m.tenantId === state.workspace.tenantId &&
                  m.state !== "archived",
              )
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
          </select>
        </label>
        <fieldset className="my-4">
          <legend>Sources to search</legend>
          {sources.length ? (
            sources.map((source) => (
              <label key={source.id} className="flex items-center gap-2 py-1">
                <input
                  type="checkbox"
                  checked={sourceIds.includes(source.id)}
                  onChange={(e) =>
                    setSelection(
                      e.target.checked
                        ? [...sourceIds, source.id]
                        : sourceIds.filter((id) => id !== source.id),
                    )
                  }
                />
                {source.name}
              </label>
            ))
          ) : (
            <p>
              No ready sources in this scope. Add content below or select
              sources in your mission.
            </p>
          )}
        </fieldset>
        <label>
          Search query
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={2000}
            required
            placeholder="For example, cancellation policy"
          />
        </label>
        <button
          className={s.primary + " mt-4"}
          disabled={busy || !query.trim() || !sourceIds.length}
        >
          {busy ? "Searching…" : "Search sources"}
        </button>
      </form>
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
      <div aria-live="polite" aria-busy={busy}>
        {items && (
          <p>
            {items.length
              ? `${items.length} matching source${items.length === 1 ? "" : "s"}`
              : "No matching content in the selected sources. Try different words or a broader selection."}
          </p>
        )}
        {items?.map((item) => (
          <article className={s.source} key={item.sourceId}>
            <h3>{item.sourceName}</h3>
            <blockquote className="whitespace-pre-wrap break-words">
              {item.excerpt}
            </blockquote>
            <p className="break-all">
              Source {item.sourceId} · Version {item.sourceVersion}
            </p>
            <p>
              Added{" "}
              <time dateTime={item.createdAt}>
                {new Date(item.createdAt).toLocaleString()}
              </time>
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
