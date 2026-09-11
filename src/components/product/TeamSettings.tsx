"use client";
import { useState } from "react";
import { useWorkspace } from "@/components/shell/WorkspaceProvider";
import type { StoreState } from "@/lib/domain/types";
import s from "./workspace.module.css";
export function TeamSettings() {
  const { data, loading, reload } = useWorkspace<StoreState>();
  const [tab, setTab] = useState("People"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  if (loading || !data) return <p role="status">Loading settings…</p>;
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const body =
        tab === "People"
          ? {
              action: "member",
              name: f.get("name"),
              email: f.get("email"),
              role: f.get("role"),
            }
          : {
              action: "group",
              name: f.get("name"),
              memberIds: f.getAll("members"),
            };
      const r = await fetch("/api/v1/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.message ?? "Could not save.");
      await reload();
      form.reset();
      setNotice("Saved to your workspace directory.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={s.page}>
      <header className={s.head}>
        <div>
          <h1>Settings</h1>
          <p>Your people, their responsibilities, and your usage.</p>
        </div>
        <a href="/api/v1/export" download="orbis-export.json" className={s.secondary}>Export workspace</a>
      </header>
      <nav className={s.tabs} aria-label="Settings sections">
        {["People", "Groups", "Roles", "Usage"].map((t) => (
          <button
            key={t}
            aria-pressed={tab === t}
            onClick={() => {
              setTab(t);
              setError("");
              setNotice("");
            }}
          >
            {t}
          </button>
        ))}
      </nav>
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {tab === "People" && (
        <>
          <section className={s.section}>
            <h2>Workspace directory</h2>
            <p>
              Directory records organise your team. Sign-in invitations and
              access enforcement are not enabled on this installation.
            </p>
            {data.memberships.map((m) => (
              <div className={s.row} key={m.id}>
                <div>
                  <strong>{m.name}</strong>
                  <p>{m.email}</p>
                </div>
                <span className={s.badge}>{m.role}</span>
              </div>
            ))}
          </section>
          <form key="person" className={s.section} onSubmit={save}>
            <h2>Add a person</h2>
            <div className={s.grid}>
              <label>
                Full name
                <input name="name" required minLength={2} maxLength={100} />
              </label>
              <label>
                Email
                <input name="email" type="email" required maxLength={254} />
              </label>
              <label>
                Responsibility
                <select name="role">
                  <option value="operator">Operator</option>
                  <option value="expert">Expert</option>
                  <option value="admin">Administrator</option>
                </select>
              </label>
            </div>
            <button disabled={busy} className={`${s.primary} mt-5`}>
              {busy ? "Saving…" : "Add to directory"}
            </button>
          </form>
        </>
      )}
      {tab === "Groups" && (
        <>
          <section className={s.section}>
            <h2>Your groups</h2>
            {data.teamGroups?.length ? (
              data.teamGroups.map((g) => (
                <div className={s.row} key={g.id}>
                  <div>
                    <strong>{g.name}</strong>
                    <p>
                      {g.memberIds
                        .map(
                          (id) =>
                            data.memberships.find((m) => m.id === id)?.name,
                        )
                        .filter(Boolean)
                        .join(", ") || "No members yet"}
                    </p>
                  </div>
                  <span>{g.memberIds.length} people</span>
                </div>
              ))
            ) : (
              <p>
                Create a group to organise people around a team or a client.
              </p>
            )}
          </section>
          <form key="group" className={s.section} onSubmit={save}>
            <h2>Create a group</h2>
            <label>
              Group name
              <input name="name" required minLength={2} maxLength={100} />
            </label>
            <fieldset className="my-5">
              <legend>Members</legend>
              {data.memberships.map((m) => (
                <label key={m.id} className="my-3">
                  <span>
                    <input
                      style={{ width: "auto", marginRight: 10 }}
                      name="members"
                      type="checkbox"
                      value={m.id}
                    />
                    {m.name}
                  </span>
                </label>
              ))}
            </fieldset>
            <button disabled={busy} className={s.primary}>
              {busy ? "Saving…" : "Create group"}
            </button>
          </form>
        </>
      )}
      {tab === "Roles" && (
        <section className={s.section}>
          <h2>Team responsibilities</h2>
          <p>
            These labels describe responsibilities. They do not currently
            enforce application permissions.
          </p>
          {[
            ["Owner", "Account ownership and company decisions."],
            ["Administrator", "People, tools and workspace configuration."],
            ["Operator", "Day-to-day missions and results."],
            ["Expert", "Mission instructions, sources and quality review."],
          ].map(([title, description]) => (
            <div className={s.row} key={title}>
              <div>
                <strong>{title}</strong>
                <p>{description}</p>
              </div>
            </div>
          ))}
        </section>
      )}
      {tab === "Usage" && (
        <>
          <section className={s.section}>
            <h2>Recorded usage</h2>
            <p>Recorded cost entries, not a live provider invoice.</p>
            {["provider", "platform", "connector", "human_review"].map(
              (kind) => (
                <div className={s.row} key={kind}>
                  <strong>{kind.replace("_", " ")}</strong>
                  <span>
                    {data.usage
                      .filter(
                        (u) =>
                          u.kind === kind &&
                          data.runs.some(
                            (r) => r.id === u.runId && r.engine === "agent-v1",
                          ),
                      )
                      .reduce((sum, u) => sum + u.amountEur, 0)
                      .toLocaleString("en-IE", {
                        style: "currency",
                        currency: "EUR",
                      })}
                  </span>
                </div>
              ),
            )}
          </section>
          <a className={s.secondary} href="/pricing">
            Understand plans and usage ↗
          </a>
        </>
      )}
    </div>
  );
}
