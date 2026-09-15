"use client";
import { useState } from "react";
import Link from "next/link";
import type { BusinessWorkflow } from "@/lib/workflows/blueprints";
import s from "./workspace.module.css";
import flowStyles from "./mission-flow.module.css";
import { RentalPreview } from "./RentalPreview";
import { MissionFlow } from "./MissionFlow";
import { Orbi } from "./Orbi";
import { useWorkspace } from "@/components/shell/WorkspaceProvider";
import type { StoreState } from "@/lib/domain/types";
export function WorkflowBlueprint({
  blueprint: b,
}: {
  blueprint: BusinessWorkflow;
}) {
  const { data, reload } = useWorkspace<StoreState>();
  const saved = data?.workflowBriefs?.find(
    (brief) => brief.workflowId === b.id,
  );
  const [tab, setTab] = useState("How it works"),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const form = new FormData(e.currentTarget);
    try {
      const response = await fetch(`/api/v1/workflows/${b.id}/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: Object.fromEntries(
            b.questions.map((q) => [q.key, form.get(q.key)]),
          ),
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.message || result.error || "Could not save your brief.",
        );
      await reload();
      setNotice(
        "Implementation brief saved. Next: connect accounts, verify scopes and run a supervised end-to-end trial. Nothing has been scheduled or sent.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={s.page}>
      <Link href="/catalog" className="text-sm text-muted">
        ← Marketplace
      </Link>
      <header className={s.head + " mt-6"}>
        <div>
          <h1>{b.name}</h1>
          <p>{b.outcome === b.name ? b.audience : b.outcome}</p>
        </div>
        <button className={s.primary} onClick={() => setTab("Your setup")}>
          Prepare this workflow ↗
        </button>
      </header>
      <nav className={s.tabs} aria-label="Workflow sections">
        {["How it works", "Your setup", "Quality & control"].map((t) => (
          <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>
      {tab === "How it works" && (
        <>
          <MissionFlow kind={b.id} />
          <section className={s.section}>
            <h2>Choose the result you need</h2>
            <p>
              Each task defines a bounded result. Prepare your implementation
              brief below; saving a brief does not start work or incur charges.
            </p>
            <div className={flowStyles.taskGrid}>
              {b.tasks?.map((task) => (
                <article className={flowStyles.taskCard} key={task.id}>
                  <span className={flowStyles.unit}>
                    Per {task.unit ?? "task"}
                  </span>
                  <h3>{task.name}</h3>
                  <p>{task.outcome}</p>
                  <dl>
                    <dt>Bring</dt>
                    <dd>{task.input}</dd>
                    <dt>Scope</dt>
                    <dd>{task.limit ?? "Confirm in setup"}</dd>
                    <dt>Decision gate</dt>
                    <dd>{task.policy ?? task.acceptance}</dd>
                  </dl>
                  <details>
                    <summary>Acceptance & tool choices</summary>
                    <p>{task.acceptance}</p>
                    <p>{task.tools?.join(" · ")}</p>
                  </details>
                </article>
              ))}
            </div>
          </section>
          <section className={s.section}>
            <h2>Starts when it matters</h2>
            <div className="flex flex-wrap gap-3">
              {b.trigger.map((t) => (
                <span className={s.badge} key={t}>
                  {t}
                </span>
              ))}
            </div>
          </section>
          <details className={s.section}>
            <summary className="cursor-pointer text-lg">
              Detailed operating steps
            </summary>
            {b.stages.map((stage, i) => (
              <details className={s.section} key={stage.id}>
                <summary className="cursor-pointer text-lg">
                  <span className="mr-3 text-blue-500">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {stage.name}
                </summary>
                <p>{stage.work}</p>
                <div className={s.grid + " mt-5"}>
                  <div>
                    <strong className="text-sm">Ready when</strong>
                    <p>{stage.gate}</p>
                  </div>
                  <div>
                    <strong className="text-sm">What you get</strong>
                    <p>{stage.output}</p>
                  </div>
                </div>
              </details>
            ))}
          </details>
          <button
            className={s.primary}
            onClick={() => {
              setTab("Your setup");
              window.scrollTo({ top: 0, behavior: "instant" });
            }}
          >
            Prepare my setup ↗
          </button>
        </>
      )}
      {tab === "Your setup" && (
        <>
          <section className={s.section}>
            <h2>Your tools, with a clear role</h2>
            {b.integrations.map((i) => (
              <div className={s.row} key={i.name}>
                <div>
                  <strong>{i.name}</strong>
                  <p>{i.role}</p>
                </div>
                <span className={s.badge}>
                  {i.required ? "Required capability" : "Optional"}
                </span>
              </div>
            ))}
            <Link href="/connections" className={s.secondary}>
              Manage connections ↗
            </Link>
          </section>
          {b.id === "rental-operations" && <RentalPreview />}
          <form className={s.section} onSubmit={save}>
            <h2>Make this workflow yours</h2>
            <p>
              This brief defines the implementation and its acceptance criteria.
              Saving it does not activate background work.
            </p>
            {b.questions.map((q) => (
              <label className="mt-5" key={q.key}>
                {q.label}
                <textarea
                  defaultValue={saved?.answers[q.key] ?? ""}
                  name={q.key}
                  required
                  minLength={10}
                  maxLength={4000}
                  rows={3}
                  placeholder={q.hint}
                />
              </label>
            ))}
            {error && (
              <p role="alert" className={s.error}>
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="my-5">
                <Orbi mood="done" size={64} />
                {notice}
              </p>
            )}
            <button disabled={busy} className={s.primary + " mt-5"}>
              {busy && <Orbi mood="thinking" size={32} working />}
              {busy ? "Saving…" : "Save implementation brief"}
            </button>
          </form>
        </>
      )}
      {tab === "Quality & control" && (
        <>
          {[
            ["Your boundaries", b.controls],
            ["What we measure", b.metrics],
            ["What improves over time", b.memory],
          ].map(([title, items]) => (
            <section className={s.section} key={title as string}>
              <h2>{title}</h2>
              <ul className="list-disc space-y-3 pl-5">
                {(items as string[]).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
