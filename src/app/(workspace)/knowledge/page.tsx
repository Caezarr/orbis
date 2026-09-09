"use client";

import { useState } from "react";
import { useWorkspace } from "@/components/shell/WorkspaceProvider";
import type { StoreState } from "@/lib/domain/types";

export default function KnowledgePage() {
  const { data, reload, loading } = useWorkspace<StoreState>();
  const [name, setName] = useState("Offer catalog excerpt");
  const [excerpt, setExcerpt] = useState("");

  if (loading || !data) return <p className="text-muted">Loading…</p>;

  async function add() {
    await fetch("/api/v1/sources", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, excerpt }),
    });
    setExcerpt("");
    await reload();
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="serif text-4xl">Knowledge</h1>
      <p className="mt-2 text-muted">Sources, instructions and memory — with provenance. Conflicts stay visible.</p>

      <section className="mt-8">
        <h2 className="text-sm font-medium">Sources</h2>
        <ul className="mt-3 divide-y divide-line overflow-hidden rounded-[14px] border border-line bg-surface">
          {data.sources.map((source) => (
            <li key={source.id} className="px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{source.name}</p>
                <span className="text-xs text-muted">{source.status} · {source.kind}</span>
              </div>
              <p className="mt-1 text-sm text-muted">{source.excerpt}</p>
            </li>
          ))}
        </ul>
        <div className="mt-4 rounded-[14px] border border-line bg-surface p-4">
          <p className="text-sm font-medium">Upload a document excerpt</p>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-3 w-full rounded-[8px] border border-line px-3 py-2 text-sm"
          />
          <textarea
            value={excerpt}
            onChange={(event) => setExcerpt(event.target.value)}
            rows={4}
            placeholder="Paste the approved text. Files stay quarantined in production; this MVP stores an excerpt with ACL later."
            className="mt-2 w-full rounded-[8px] border border-line p-3 text-sm"
          />
          <button
            type="button"
            onClick={() => void add()}
            disabled={!excerpt.trim()}
            className="mt-3 rounded-[8px] bg-ink px-4 py-2 text-sm text-canvas disabled:opacity-40"
          >
            Add source
          </button>
        </div>
      </section>

      <section className="mt-10 grid gap-4 md:grid-cols-2">
        <article className="rounded-[14px] border border-line bg-surface p-5">
          <h2 className="text-sm font-medium">Instructions</h2>
          <ul className="mt-3 space-y-3 text-sm">
            {data.instructions.map((item) => (
              <li key={item.id}>
                <p className="font-medium">{item.title}</p>
                <p className="text-muted">{item.body}</p>
                <p className="mt-1 text-xs text-muted">{item.scope} · {item.provenance}</p>
              </li>
            ))}
          </ul>
        </article>
        <article className="rounded-[14px] border border-line bg-surface p-5">
          <h2 className="text-sm font-medium">Memory</h2>
          <ul className="mt-3 space-y-3 text-sm">
            {data.memory.map((item) => (
              <li key={item.id}>
                <p className="font-medium">{item.title}</p>
                <p className="text-muted">{item.body}</p>
                <p className="mt-1 text-xs text-muted">
                  {item.kind} · {item.scope} · {item.status}
                </p>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </div>
  );
}
