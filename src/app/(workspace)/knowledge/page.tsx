"use client";
import { useState } from "react";
import Link from "next/link";
import { useWorkspace } from "@/components/shell/WorkspaceProvider";
import type { StoreState } from "@/lib/domain/types";
import s from "@/components/product/workspace.module.css";
export default function KnowledgePage() {
  const { data, reload, loading } = useWorkspace<StoreState>();
  const [tab, setTab] = useState("Sources"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fields = new FormData(form);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/v1/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(fields.get("name")).trim(),
          excerpt: String(fields.get("excerpt")).trim(),
        }),
      });
      if (!r.ok)
        throw new Error(
          "Could not save this source. Check that both fields contain text.",
        );
      await reload();
      form.reset();
      setNotice("Source added. You can select it in your mission.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  if (loading || !data) return <p role="status">Loading knowledge…</p>;
  return (
    <div className={s.page}>
      <header className={s.head}>
        <div>
          <h1>Knowledge</h1>
          <p>The context your agents need to do good work.</p>
        </div>
        <Link href="/knowledge/scopes" className={s.secondary}>
          Choose folders & access ↗
        </Link>
      </header>
      <nav className={s.tabs} aria-label="Knowledge sections">
        {["Sources", "Instructions", "Memory"].map((t) => (
          <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>
      {tab === "Sources" && (
        <>
          <section className={s.section}>
            <h2>Your sources</h2>
            {data.sources.length ? (
              data.sources.map((item) => (
                <details className={s.source} key={item.id}>
                  <summary>
                    <strong>{item.name}</strong>
                    <span className={s.badge}>{item.status}</span>
                  </summary>
                  <p>{item.excerpt}</p>
                </details>
              ))
            ) : (
              <p>
                Add a price list, a policy, or the context you use every day.
              </p>
            )}
          </section>
          <form className={s.section} onSubmit={add}>
            <h2>Add a text source</h2>
            <label>
              Source name
              <input
                name="name"
                placeholder="For example, customer support policy"
                required
                maxLength={200}
              />
            </label>
            <label className="mt-4">
              Approved content
              <textarea
                name="excerpt"
                rows={5}
                required
                maxLength={20000}
                placeholder="Paste the information your agents should use."
              />
            </label>
            {error && (
              <p role="alert" className={s.error}>
                {error}
              </p>
            )}
            {notice && <p role="status">{notice}</p>}
            <button className={s.primary + " mt-4"} disabled={busy}>
              {busy ? "Saving…" : "Add source"}
            </button>
          </form>
        </>
      )}
      {tab === "Instructions" && (
        <section className={s.section}>
          <h2>How your agents should work</h2>
          <p>Instructions are defined in each mission’s setup.</p>
          {data.instructions.map((item) => (
            <div className={s.row} key={item.id}>
              <div>
                <strong>{item.title}</strong>
                <p>{item.body}</p>
                <p>
                  {item.scope} · {item.provenance}
                </p>
              </div>
            </div>
          ))}
          <Link href="/today" className={s.secondary}>
            Open your missions
          </Link>
        </section>
      )}
      {tab === "Memory" && (
        <section className={s.section}>
          <h2>What your agents remember</h2>
          <p>Review the context, its source and its status.</p>
          {data.memory.length ? (
            data.memory.map((item) => (
              <div className={s.row} key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.body}</p>
                  <p>
                    {item.kind} · {item.scope}
                  </p>
                </div>
                <span className={s.badge}>{item.status}</span>
              </div>
            ))
          ) : (
            <p>No memory recorded yet.</p>
          )}
        </section>
      )}
    </div>
  );
}
