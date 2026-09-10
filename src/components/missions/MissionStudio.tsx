"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Markdown from "react-markdown";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  CheckCheck,
  Circle,
  Copy,
  FileText,
  LoaderCircle,
  Play,
  Settings2,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import type { Mission, Run, StoreState } from "@/lib/domain/types";
import styles from "./studio.module.css";

type Provider = { configured: boolean; provider: string; model: string };
async function request(
  url: string,
  body: unknown,
  method = "POST",
  headers = {},
) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.message || "Something went wrong. Try again.");
  return result;
}

export function MissionStudio({
  data,
  mission,
  reload,
}: {
  data: StoreState;
  mission: Mission;
  reload: () => Promise<void>;
}) {
  const version = data.missionVersions.find(
    (v) => v.id === mission.draftVersionId,
  )!;
  const cases = data.cases.filter(
    (c) =>
      !mission.flowId && c.packageSlug === mission.packageSlug && c.tenantId === mission.tenantId,
  );
  const [input, setInput] = useState(mission.initialRequest ?? cases[0]?.body ?? "");
  const [provider, setProvider] = useState<Provider | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState("");
  const [tab, setTab] = useState<"deliverable" | "evidence" | "history">(
    "deliverable",
  );
  const [correction, setCorrection] = useState("");
  const [copied, setCopied] = useState(false);
  const runs = data.runs
    .filter((r) => r.missionId === mission.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const run = runs.find((r) => r.id === selected) ?? runs[0];
  const artifact = data.artifacts.find((a) => a.id === run?.artifactIds[0]);
  const evaluation = data.evaluations.find((e) => e.id === run?.evaluationId);
  const sources = data.sources.filter(
    (s) =>
      version.knowledgeSourceIds.includes(s.id) &&
      s.tenantId === mission.tenantId &&
      s.status === "ready",
  );
  const rules = data.memory.filter(
    (m) =>
      m.missionId === mission.id &&
      m.scope === "general_rule" &&
      m.status !== "rejected",
  );
  const live = run?.engine === "agent-v1";
  const running = runs.some(
    (r) => r.engine === "agent-v1" && r.state === "running",
  );

  useEffect(() => {
    let active = true;
    fetch("/api/v1/runtime")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((p) => {
        if (active) setProvider(p);
      })
      .catch(() => {
        if (active)
          setNotice(
            "Could not check the provider connection. Refresh to retry.",
          );
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!busy && !running) return;
    const timer = setInterval(() => {
      void reload().catch(() => {});
    }, 2000);
    return () => clearInterval(timer);
  }, [busy, running, reload]);

  async function execute() {
    if (busy) return;
    setBusy(true);
    setNotice("");
    setSelected("");
    setTab("deliverable");
    try {
      const result = await request(
        `/api/v1/missions/${mission.id}/test-runs`,
        { text: input, mode: "test" },
        "POST",
        { "Idempotency-Key": crypto.randomUUID() },
      );
      setSelected(result.run.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Run failed");
    } finally {
      await reload().catch(() =>
        setNotice("Could not refresh the run. Reload the page."),
      );
      setBusy(false);
    }
  }
  async function proposeRule() {
    if (!evaluation || !correction.trim()) return;
    setSaving(true);
    setNotice("");
    try {
      await request(`/api/v1/evaluations/${evaluation.id}/feedback`, {
        correction,
        scope: "general_rule",
        accepted: false,
      });
      setCorrection("");
      await reload();
      setNotice(
        "Rule proposed. Approve it below before running again; the original result is preserved.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not save correction",
      );
    } finally {
      setSaving(false);
    }
  }
  async function updateRule(id: string, status: "approved" | "rejected") {
    setSaving(true);
    try {
      await request(`/api/v1/memory/${id}`, { status }, "PATCH");
      await reload();
      setNotice(
        status === "approved"
          ? "Rule approved for this mission. Run again to evaluate its effect."
          : "Rule removed from future context.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not update rule",
      );
    } finally {
      setSaving(false);
    }
  }
  async function accept() {
    if (!evaluation) return;
    setSaving(true);
    try {
      await request(`/api/v1/evaluations/${evaluation.id}/feedback`, {
        correction: "",
        scope: "this_result",
        accepted: true,
      });
      await reload();
      setNotice("Review recorded. No external action has been triggered.");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not record review",
      );
    } finally {
      setSaving(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(artifact?.body ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setNotice("Clipboard unavailable. Select and copy the result manually.");
    }
  }
  const status = (r: Run) =>
    r.engine !== "agent-v1"
      ? "Example run"
      : r.state === "succeeded"
        ? "Ready for review"
        : r.state === "waiting_input"
          ? "Needs attention"
          : r.state;
  return (
    <div className={styles.studio}>
      <div className={styles.breadcrumb}>
        <Link href="/missions">
          <ArrowLeft size={14} /> Missions
        </Link>
        <span>/</span>
        <span>Mission studio</span>
      </div>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>
            <span /> YOUR TEAM, IN MOTION
          </div>
          <h1>{mission.name}</h1>
          <p>{version.outcome}</p>
        </div>
        <Link
          className={styles.secondary}
          href={`/missions/${mission.id}/setup`}
        >
          <Settings2 size={16} /> Configure
        </Link>
      </header>
      <div className={styles.safety}>
        <ShieldCheck size={17} />
        <span>
          Local test workspace <b>·</b> Human review before any next step
        </span>
        <span className={styles.provider}>
          {provider?.configured
            ? `${provider.provider} · ${provider.model}`
            : "AI connection needed"}
        </span>
      </div>
      {notice && (
        <div className={styles.notice} role="status">
          {notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <div className={styles.layout}>
        <aside className={styles.left}>
          <section className={styles.panel}>
            <div className={styles.sectionTitle}>
              <span className={styles.number}>01</span>
              <h2>Give it a mission</h2>
            </div>
            <p className={styles.muted}>
              A real request. Your context. A usable result.
            </p>
            {cases.length > 0 && (
              <label className={styles.label}>
                Start from an example
                <select
                  defaultValue={cases[0].id}
                  disabled={busy}
                  onChange={(e) =>
                    setInput(
                      cases.find((c) => c.id === e.target.value)?.body ?? "",
                    )
                  }
                >
                  <option value="">Write my own request</option>
                  {cases.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className={styles.label}>
              What should your agent deliver?
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={busy}
                maxLength={20000}
                rows={9}
                placeholder="Describe the result, audience and constraints…"
              />
            </label>
            <div className={styles.inputMeta}>
              <span>{input.length.toLocaleString()} / 20,000</span>
              <span>Read-only execution</span>
            </div>
            <button
              className={styles.primary}
              disabled={
                busy ||
                running ||
                !provider?.configured ||
                input.trim().length < 10
              }
              onClick={execute}
            >
              {busy || running ? (
                <LoaderCircle size={17} className={styles.spin} />
              ) : (
                <Play size={15} />
              )}{" "}
              {busy || running ? "Your team is working…" : "Run this mission"}
              <ArrowUpRight size={16} />
            </button>
            <p className={styles.fine}>
              Up to 5 model calls · 2,400 output tokens per call.
              <br />
              Billed by your provider. No verified euro estimate.
            </p>
            {!provider?.configured && (
              <details className={styles.connect}>
                <summary>Connect your AI to start</summary>
                <p>
                  On the server, set these environment variables, then restart
                  and refresh:
                </p>
                <code>
                  ORBIS_AI_PROVIDER=openai
                  <br />
                  ORBIS_AI_MODEL=your-model-id
                  <br />
                  OPENAI_API_KEY=your-key
                </code>
                <p>
                  Anthropic is also supported using <code>anthropic</code> and{" "}
                  <code>ANTHROPIC_API_KEY</code>. Keys are never entered or
                  exposed in this browser.
                </p>
              </details>
            )}
          </section>
          <section className={styles.panel}>
            <div className={styles.sectionTitle}>
              <span className={styles.number}>02</span>
              <h2>Grounded in your business</h2>
            </div>
            <div className={styles.sourceList}>
              {sources.length ? (
                sources.map((s) => (
                  <div key={s.id}>
                    <FileText size={16} />
                    <span>
                      {s.name}
                      <small>
                        {s.status} · {s.version}
                      </small>
                    </span>
                  </div>
                ))
              ) : (
                <p>No sources selected.</p>
              )}
            </div>
            <Link
              className={styles.textLink}
              href={`/missions/${mission.id}/setup`}
            >
              Manage context <ArrowUpRight size={13} />
            </Link>
          </section>
          <section className={styles.panel}>
            <div className={styles.sectionTitle}>
              <Sparkles size={16} />
              <h2>Mission memory</h2>
              <span className={styles.count}>{rules.length}</span>
            </div>
            <p className={styles.muted}>
              Rules stay scoped to this mission. You approve what it learns.
            </p>
            {rules.length ? (
              rules.map((rule) => (
                <div className={styles.rule} key={rule.id}>
                  <small>
                    {rule.status === "approved"
                      ? "Used in future runs"
                      : "Awaiting your approval"}
                  </small>
                  <p>{rule.body}</p>
                  <div>
                    {rule.status === "proposed" && (
                      <button
                        disabled={saving || busy}
                        onClick={() => updateRule(rule.id, "approved")}
                      >
                        <Check size={13} /> Approve rule
                      </button>
                    )}
                    <button
                      disabled={saving || busy}
                      onClick={() => updateRule(rule.id, "rejected")}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className={styles.fine}>
                Your first correction becomes a proposed rule here.
              </p>
            )}
          </section>
        </aside>
        <div className={styles.right}>
          <section className={styles.workflow}>
            <div className={styles.workflowHeading}>
              <div>
                <span className={styles.eyebrow}>THE WORKFLOW</span>
                <h2>Small team. Clear responsibilities.</h2>
              </div>
              <span className={styles.badge}>
                {live ? "Live trace" : "Workflow preview"}
              </span>
            </div>
            <div className={styles.graph}>
              {["Frame", "Produce", "Challenge", "Repair if needed"].map(
                (name, i) => (
                  <div key={name}>
                    <span className={styles.node}>{i + 1}</span>
                    <strong>{name}</strong>
                    <small>
                      {
                        [
                          "Clarify the outcome",
                          "Build the deliverable",
                          "Check every claim",
                          "One bounded revision",
                        ][i]
                      }
                    </small>
                  </div>
                ),
              )}
            </div>
            {live && run.steps.length > 0 && (
              <div className={styles.traces} aria-live="polite">
                {run.steps.map((step) => (
                  <div key={step.id}>
                    {step.status === "running" ? (
                      <LoaderCircle className={styles.spin} size={14} />
                    ) : step.status === "succeeded" ? (
                      <Check size={14} />
                    ) : (
                      <Circle size={14} />
                    )}
                    <span>{step.name}</span>
                    <small>
                      {step.durationMs
                        ? `${(step.durationMs / 1000).toFixed(1)}s · ${step.tokens ?? 0} tokens`
                        : step.status}
                    </small>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className={styles.result}>
            <div className={styles.resultTop}>
              <div
                className={styles.tabs}
                role="tablist"
                aria-label="Run details"
              >
                {(["deliverable", "evidence", "history"] as const).map((t) => (
                  <button
                    role="tab"
                    tabIndex={tab === t ? 0 : -1}
                    onKeyDown={(e) => {
                      const order = [
                        "deliverable",
                        "evidence",
                        "history",
                      ] as const;
                      if (
                        !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                          e.key,
                        )
                      )
                        return;
                      e.preventDefault();
                      const next =
                        e.key === "Home"
                          ? 0
                          : e.key === "End"
                            ? 2
                            : (order.indexOf(t) +
                                (e.key === "ArrowRight" ? 1 : 2)) %
                              3;
                      setTab(order[next]);
                      document.getElementById(`tab-${order[next]}`)?.focus();
                    }}
                    id={`tab-${t}`}
                    aria-controls="run-panel"
                    aria-selected={tab === t}
                    className={tab === t ? styles.activeTab : ""}
                    key={t}
                    onClick={() => setTab(t)}
                  >
                    {t === "deliverable"
                      ? "Deliverable"
                      : t === "evidence"
                        ? `Evidence ${artifact?.citations.length ?? 0}`
                        : `History ${runs.length}`}
                  </button>
                ))}
              </div>
              {run && <span className={styles.badge}>{status(run)}</span>}
            </div>
            <div
              role="tabpanel"
              id="run-panel"
              aria-labelledby={`tab-${tab}`}
              className={styles.resultBody}
            >
              {tab === "history" ? (
                <div className={styles.history}>
                  {runs.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => {
                        setSelected(r.id);
                        setTab("deliverable");
                      }}
                    >
                      <div>
                        <strong>{status(r)}</strong>
                        <span>{r.inputText.slice(0, 100)}</span>
                      </div>
                      <small>{new Date(r.createdAt).toLocaleString()}</small>
                      <ArrowUpRight size={15} />
                    </button>
                  ))}
                </div>
              ) : tab === "evidence" ? (
                <>
                  <h2>Follow the evidence.</h2>
                  <p className={styles.muted}>
                    Quote integrity is checked in code. Claim support is
                    reviewed by AI, not guaranteed.
                  </p>
                  {artifact?.citations.map((c, i) => (
                    <blockquote
                      key={`${c.sourceId}-${i}`}
                      className={styles.quote}
                    >
                      <small>
                        {i + 1}. {c.sourceName}
                      </small>
                      <p>“{c.excerpt}”</p>
                      {c.locator && <footer>Supports: {c.locator}</footer>}
                    </blockquote>
                  ))}
                  {evaluation?.checks.map((c) => (
                    <div className={styles.checkRow} key={c.id}>
                      <span data-status={c.status}>
                        {c.status === "pass" ? (
                          <CheckCheck size={17} />
                        ) : (
                          <Circle size={17} />
                        )}
                      </span>
                      <div>
                        <strong>{c.label}</strong>
                        <p>{c.detail}</p>
                      </div>
                    </div>
                  ))}
                </>
              ) : artifact ? (
                <>
                  {!live && (
                    <div className={styles.example}>
                      Illustrative example — not generated by your connected
                      model. Run a mission to replace it with a real result.
                    </div>
                  )}
                  <div className={styles.documentHeading}>
                    <span className={styles.documentIcon}>
                      <FileText size={24} />
                    </span>
                    <button
                      className={styles.iconButton}
                      onClick={copy}
                      aria-label="Copy deliverable"
                    >
                      {copied ? <Check size={17} /> : <Copy size={17} />}
                    </button>
                  </div>
                  <h2>{artifact.title}</h2>
                  <div className={styles.document}>
                    <Markdown skipHtml>{artifact.body}</Markdown>
                  </div>
                  {artifact.unknowns.length > 0 && (
                    <div className={styles.unknowns}>
                      <strong>Before you act</strong>
                      <ul>
                        {artifact.unknowns.map((u, i) => (
                          <li key={i}>{u}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {live && (
                    <div className={styles.reviewBar}>
                      <div>
                        <strong>
                          {evaluation?.gatePassed
                            ? "Checks passed. Your judgment comes next."
                            : "This result needs another look."}
                        </strong>
                        <p>
                          {run.usage
                            ? `${run.usage.inputTokens.toLocaleString()} input · ${run.usage.outputTokens.toLocaleString()} output tokens · provider billing applies`
                            : ""}
                        </p>
                      </div>
                      <button
                        className={styles.secondary}
                        disabled={
                          saving ||
                          busy ||
                          !evaluation?.gatePassed ||
                          !!evaluation?.humanFeedback?.accepted
                        }
                        onClick={accept}
                      >
                        <Check size={15} />
                        {evaluation?.humanFeedback?.accepted
                          ? "Reviewed"
                          : "Mark reviewed"}
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className={styles.empty}>
                  <Sparkles size={32} />
                  <h2>
                    {busy
                      ? "Turning context into useful work."
                      : run?.error
                        ? "The run could not finish."
                        : "Your next deliverable starts here."}
                  </h2>
                  <p>
                    {run?.error ||
                      "Describe the outcome, check your sources, and let the workflow prepare a result for your review."}
                  </p>
                </div>
              )}
            </div>
            {live && artifact && (
              <div className={styles.feedback}>
                <label htmlFor="correction">
                  <Sparkles size={17} /> Make the next run better
                </label>
                <p>
                  Describe a reusable instruction. We preserve this result and
                  ask you to approve the new rule.
                </p>
                <textarea
                  id="correction"
                  value={correction}
                  onChange={(e) => setCorrection(e.target.value)}
                  maxLength={8000}
                  placeholder="For this mission, always separate customer requests from confirmed commitments…"
                  rows={3}
                />
                <button
                  className={styles.secondary}
                  disabled={!correction.trim() || saving || busy}
                  onClick={proposeRule}
                >
                  Propose a mission rule <ArrowUpRight size={15} />
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
