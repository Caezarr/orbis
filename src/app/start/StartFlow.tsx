"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Orbi } from "@/components/product/Orbi";
import { ToolLogo } from "@/components/product/ToolLogo";
import {
  BLOCKER_COPY,
  decodePending,
  decodePreviewShown,
  deriveStep,
  encodePending,
  encodePreviewShown,
  flagLabel,
  inboxErrorKind,
  isPending,
  NOT_FOUND_LABEL,
  PENDING_KEY,
  PREVIEW_SHOWN_KEY,
  quotePreview,
  progressPhase,
  stepState,
  summarizeResults,
  type BlockerKind,
  type InboxBatchView,
  type InboxMessageView,
  type MailboxStatus,
  type StartPreview,
  type StartProfile,
  type StartStep,
} from "@/lib/start/flow";
import { ContinuousToggle } from "./ContinuousToggle";
import { PlanBanner } from "@/components/billing/PlanBanner";
import { DraftCard } from "./DraftCard";
import s from "./start.module.css";

export type StartSession = "anonymous" | "authenticated" | "offline";
type Provider = "gmail" | "outlook";
type Readiness = {
  session: "authenticated" | "offline";
  profile: { name: string; summary: string; website?: string } | null;
  inbox: { enabled: boolean; mode: "test" | "scoped_autonomy"; aiConfigured: boolean; budgetConfigured: boolean };
  providers: Record<Provider, { configured: boolean }>;
};
const PROVIDERS: { id: Provider; name: string }[] = [
  { id: "gmail", name: "Gmail" },
  { id: "outlook", name: "Outlook" },
];
const STEP_TITLES: Record<StartStep, string> = {
  company: "Votre entreprise",
  account: "Votre compte",
  mailbox: "Votre boîte mail",
  drafts: "Vos premiers brouillons",
};
const INBOX_KEY = "orbis:start:inbox-key";

/* Storage can throw (private mode, blocked site data): never let it break the flow. */
function storage(kind: "local" | "session") {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}
function readPending() {
  try {
    return decodePending(storage("local")?.getItem(PENDING_KEY) ?? null);
  } catch {
    return null;
  }
}
function writePending(profile: StartProfile | null) {
  try {
    const store = storage("local");
    if (profile) store?.setItem(PENDING_KEY, encodePending(profile));
    else store?.removeItem(PENDING_KEY);
  } catch {}
}
function previewShown(): { ai: boolean } | null {
  try {
    return decodePreviewShown(storage("local")?.getItem(PREVIEW_SHOWN_KEY) ?? null);
  } catch {
    return null;
  }
}
function writePreviewShown(ai: boolean | null) {
  try {
    const store = storage("local");
    if (ai === null) store?.removeItem(PREVIEW_SHOWN_KEY);
    else store?.setItem(PREVIEW_SHOWN_KEY, encodePreviewShown(ai));
  } catch {}
}
async function json<T>(response: Response): Promise<T & { error?: string; code?: string }> {
  return (await response.json().catch(() => ({}))) as T & { error?: string; code?: string };
}

export function StartFlow({ session: initialSession }: { session: StartSession }) {
  const [session, setSession] = useState<StartSession>(initialSession);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [loadError, setLoadError] = useState("");
  const [pending, setPending] = useState<StartProfile | null>(null);
  // Kept when the owner goes back to edit, so the review is not lost.
  const [lastProfile, setLastProfile] = useState<StartProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [editing, setEditing] = useState(false);
  // Anonymous: the instant preview of the just-confirmed profile is open (still step 1).
  const [previewing, setPreviewing] = useState(false);
  const [mailbox, setMailbox] = useState<Record<Provider, MailboxStatus>>({ gmail: "unknown", outlook: "unknown" });
  const [batch, setBatch] = useState<InboxBatchView | null>(null);
  const [messages, setMessages] = useState<InboxMessageView[]>([]);
  const [returnedFrom, setReturnedFrom] = useState<Provider | null>(null);
  const authed = session !== "anonymous";

  const loadReadiness = useCallback(async () => {
    setLoadError("");
    try {
      const response = await fetch("/api/v1/start", { cache: "no-store" });
      if (response.status === 401) {
        setSession("anonymous");
        return null;
      }
      const body = await json<Readiness>(response);
      if (!response.ok) throw new Error(body.error);
      setReadiness(body);
      return body;
    } catch {
      setLoadError("Impossible de charger votre espace. Rechargez la page.");
      return null;
    }
  }, []);

  const verify = useCallback(async (provider: Provider) => {
    setMailbox((m) => ({ ...m, [provider]: "checking" }));
    try {
      const response = await fetch("/api/v1/start/mailbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, action: "verify" }),
      });
      const body = await json<{ status: MailboxStatus }>(response);
      setMailbox((m) => ({ ...m, [provider]: response.ok ? body.status : "error" }));
    } catch {
      setMailbox((m) => ({ ...m, [provider]: "error" }));
    }
  }, []);

  const loadInbox = useCallback(async (batchId?: string) => {
    const response = await fetch(`/api/v1/inbox${batchId ? `?batchId=${encodeURIComponent(batchId)}` : ""}`, {
      cache: "no-store",
    });
    const body = await json<{ batch?: InboxBatchView; messages?: InboxMessageView[] }>(response);
    if (!response.ok) return { ok: false as const, status: response.status, error: body.error ?? "" };
    setBatch(body.batch ?? null);
    setMessages(body.messages ?? []);
    return { ok: true as const, batch: body.batch ?? null };
  }, []);

  const saveProfile = useCallback(
    async (profile: StartProfile) => {
      setSaving(true);
      setSaveError("");
      try {
        const shown = previewShown();
        const response = await fetch("/api/v1/start/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile, ...(shown ? { preview: shown } : {}) }),
        });
        const body = await json<object>(response);
        if (response.status === 401) {
          setSession("anonymous");
          return;
        }
        if (!response.ok) throw new Error(body.error ?? "Enregistrement impossible. Réessayez.");
        writePending(null);
        writePreviewShown(null);
        setPending(null);
        setEditing(false);
        await loadReadiness();
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : "Enregistrement impossible. Réessayez.");
      } finally {
        setSaving(false);
      }
    },
    [loadReadiness],
  );

  // Boot: restore the pending profile, read the OAuth return marker, load server state.
  // Deferred so a Strict Mode double-mount cancels the first run before it acts.
  useEffect(() => {
    const timer = setTimeout(async () => {
      const stored = readPending();
      const params = new URLSearchParams(window.location.search);
      const connected = params.get("connected");
      const back = connected === "gmail" || connected === "outlook" ? connected : null;
      if (params.toString()) window.history.replaceState(null, "", "/start");
      if (stored) setPending(stored);
      if (back) setReturnedFrom(back);
      if (initialSession === "anonymous") return;
      const ready = await loadReadiness();
      if (!ready) return;
      if (stored) await saveProfile(stored);
      if (ready.session === "authenticated" && ready.inbox.enabled) await loadInbox().catch(() => undefined);
      // Server-side verification, never the browser callback: check configured providers.
      for (const p of PROVIDERS)
        if (ready.providers[p.id].configured && (stored || ready.profile)) void verify(p.id);
    }, 0);
    return () => clearTimeout(timer);
  }, [initialSession, loadReadiness, loadInbox, saveProfile, verify]);

  const anyConnected: MailboxStatus = Object.values(mailbox).includes("connected")
    ? "connected"
    : Object.values(mailbox).includes("checking")
      ? "checking"
      : "not_connected";
  const step = deriveStep({
    authenticated: authed,
    pendingProfile: !!pending,
    workspaceProfile: !!readiness?.profile,
    editingProfile: editing,
    previewing,
    mailbox: anyConnected,
    batch: batch?.status ?? null,
  });

  // Move focus to the newly opened step for keyboard and screen-reader users.
  const headingRefs = useRef<Partial<Record<StartStep, HTMLHeadingElement | null>>>({});
  const previousStep = useRef(step);
  // Only after a user action: the initial server-state load must not steal focus.
  const userActed = useRef(false);
  useEffect(() => {
    if (previousStep.current !== step && userActed.current) headingRefs.current[step]?.focus();
    previousStep.current = step;
  }, [step]);

  const connectedProvider = PROVIDERS.find((p) => mailbox[p.id] === "connected")?.id ?? batch?.provider ?? null;

  const summaries: Partial<Record<StartStep, ReactNode>> = {
    company: readiness?.profile ? (
      <>
        <strong>{readiness.profile.name}</strong>
        {readiness.profile.website && <span> · {new URL(readiness.profile.website).hostname}</span>}
      </>
    ) : pending ? (
      <strong>{pending.name}</strong>
    ) : null,
    account: authed ? <span>{session === "offline" ? "Mode démo local" : "Connecté"}</span> : null,
    mailbox: connectedProvider ? <span>{connectedProvider === "gmail" ? "Gmail" : "Outlook"} vérifié côté serveur</span> : null,
  };

  return (
    <main
      className={s.page}
      lang="fr"
      onClickCapture={() => (userActed.current = true)}
      onSubmitCapture={() => (userActed.current = true)}
    >
      <header className={s.top}>
        <Link href="/" className={s.brand}>
          <span aria-hidden="true" />
          Orbis
        </Link>
        <p className={s.topNote}>Brouillons uniquement : rien n’est jamais envoyé.</p>
      </header>
      <div className={s.intro}>
        <p className={s.eyebrow}>Démarrage</p>
        <h1>De votre site à vos premiers brouillons de réponse.</h1>
        <p>Quatre étapes sur une seule page. Vous relisez tout ; Orbi n’envoie rien.</p>
      </div>
      {loadError && (
        <p className={s.alert} role="alert">
          {loadError}
        </p>
      )}
      <ol className={s.steps}>
        {(["company", "account", "mailbox", "drafts"] as const).map((id, index) => {
          const state = stepState(id, step);
          return (
            <li key={id} className={s.step} data-state={state} aria-current={state === "current" ? "step" : undefined}>
              <div className={s.stepHead}>
                <span className={s.marker} aria-hidden="true">
                  {state === "done" ? "✓" : index + 1}
                </span>
                <h2
                  tabIndex={-1}
                  ref={(el) => {
                    headingRefs.current[id] = el;
                  }}
                >
                  {STEP_TITLES[id]}
                  <span className={s.srOnly}>
                    {state === "done" ? " (terminé)" : state === "current" ? " (en cours)" : " (à venir)"}
                  </span>
                </h2>
                {state === "done" && summaries[id] && <p className={s.summary}>{summaries[id]}</p>}
                {state === "done" && id === "company" && readiness?.profile && step !== "drafts" && (
                  <button type="button" className={s.link} onClick={() => setEditing(true)}>
                    Modifier
                  </button>
                )}
              </div>
              {state === "current" && (
                <div className={s.panel}>
                  {id === "company" && previewing && pending && !authed && (
                    <PreviewStep
                      profile={pending}
                      onContinue={() => setPreviewing(false)}
                      onEdit={() => {
                        setLastProfile(pending);
                        writePending(null);
                        setPending(null);
                        setPreviewing(false);
                      }}
                    />
                  )}
                  {id === "company" && !(previewing && pending && !authed) && (
                    <CompanyStep
                      authed={authed}
                      saving={saving}
                      saveError={saveError}
                      initial={pending ?? lastProfile}
                      onCancelEdit={editing ? () => setEditing(false) : undefined}
                      onConfirm={(profile) => {
                        if (authed) void saveProfile(profile);
                        else {
                          writePending(profile);
                          setPending(profile);
                          setPreviewing(true);
                        }
                      }}
                    />
                  )}
                  {id === "account" && pending && (
                    <AccountStep
                      profileName={pending.name}
                      onEdit={() => {
                        setLastProfile(pending);
                        writePending(null);
                        setPending(null);
                      }}
                    />
                  )}
                  {id === "mailbox" && readiness && (
                    <MailboxStep
                      readiness={readiness}
                      status={mailbox}
                      returnedFrom={returnedFrom}
                      onVerify={verify}
                      onRecheck={loadReadiness}
                    />
                  )}
                  {id === "drafts" && readiness && (
                    <DraftsStep
                      readiness={readiness}
                      provider={connectedProvider}
                      batch={batch}
                      messages={messages}
                      loadInbox={loadInbox}
                      onRecheck={loadReadiness}
                    />
                  )}
                  {(id === "mailbox" || id === "drafts") && !readiness && !loadError && (
                    <p className={s.muted} role="status">
                      Chargement de votre espace…
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </main>
  );
}

// ------------------------------------------------------------------ step 1

function CompanyStep({
  authed,
  saving,
  saveError,
  initial,
  onConfirm,
  onCancelEdit,
}: {
  authed: boolean;
  saving: boolean;
  saveError: string;
  initial: StartProfile | null;
  onConfirm: (profile: StartProfile) => void;
  onCancelEdit?: () => void;
}) {
  const [mode, setMode] = useState<"site" | "description">("site");
  const [website, setWebsite] = useState("");
  const [description, setDescription] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<StartProfile | null>(initial);
  const [kept, setKept] = useState<boolean[]>(initial?.facts.map(() => true) ?? []);

  async function read(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const body = mode === "site" ? { website } : { description, ...(name.trim() ? { name } : {}) };
      const response = await fetch("/api/v1/start/site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await json<{ profile: StartProfile }>(response);
      if (!response.ok || !result.profile) throw new Error(result.error ?? "Lecture impossible. Réessayez.");
      setProfile(result.profile);
      setKept(result.profile.facts.map(() => true));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lecture impossible. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  if (profile)
    return (
      <ProfileReview
        profile={profile}
        kept={kept}
        setKept={setKept}
        setProfile={setProfile}
        saving={saving}
        saveError={saveError}
        authed={authed}
        onRestart={() => {
          setProfile(null);
          setError("");
        }}
        onConfirm={() => onConfirm({ ...profile, facts: profile.facts.filter((_, i) => kept[i]) })}
      />
    );

  return (
    <form onSubmit={read} className={s.form} aria-busy={busy}>
      <div className={s.switch} role="group" aria-label="Comment présenter votre entreprise">
        <button type="button" aria-pressed={mode === "site"} onClick={() => setMode("site")}>
          J’ai un site
        </button>
        <button type="button" aria-pressed={mode === "description"} onClick={() => setMode("description")}>
          Je décris en deux phrases
        </button>
      </div>
      {mode === "site" ? (
        <label>
          Adresse de votre site
          <input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            inputMode="url"
            autoComplete="url"
            placeholder="votre-entreprise.fr"
            required
            minLength={4}
            maxLength={2000}
          />
          <span className={s.fine}>Orbi lit uniquement la page publique. Aucun compte requis pour cette étape.</span>
        </label>
      ) : (
        <>
          <label>
            <span>
              Nom de l’entreprise <span className={s.optional}>(facultatif)</span>
            </span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="organization" maxLength={120} />
          </label>
          <label>
            Ce que vous faites, et pour qui
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              minLength={20}
              maxLength={1200}
              rows={4}
              placeholder="Menuiserie sur mesure à Lille. Nous fabriquons et posons cuisines et dressings pour les particuliers."
            />
          </label>
        </>
      )}
      {error && (
        <p className={s.alert} role="alert">
          {error}
          {mode === "site" && (
            <>
              {" "}
              <button type="button" className={s.link} onClick={() => setMode("description")}>
                Décrire mon activité à la place
              </button>
            </>
          )}
        </p>
      )}
      <div className={s.actions}>
        {onCancelEdit && (
          <button type="button" className={s.secondary} onClick={onCancelEdit}>
            Annuler
          </button>
        )}
        <button className={s.primary} disabled={busy}>
          {busy ? "Lecture en cours…" : mode === "site" ? "Lire mon site" : "Préparer mon profil"}
        </button>
      </div>
      {busy && (
        <div className={s.working} role="status">
          <Orbi mood="thinking" size={56} working />
          <span>{mode === "site" ? "Orbi lit votre page publique…" : "Orbi prépare votre profil…"}</span>
        </div>
      )}
    </form>
  );
}

function ProfileReview({
  profile,
  kept,
  setKept,
  setProfile,
  saving,
  saveError,
  authed,
  onRestart,
  onConfirm,
}: {
  profile: StartProfile;
  kept: boolean[];
  setKept: (v: boolean[]) => void;
  setProfile: (p: StartProfile) => void;
  saving: boolean;
  saveError: string;
  authed: boolean;
  onRestart: () => void;
  onConfirm: () => void;
}) {
  const origin = {
    ai: "Proposé par Orbi à partir de votre page. Chaque citation a été vérifiée mot pour mot dans la source.",
    site: "Lecture directe de votre page : des citations exactes, sans interprétation.",
    description: "À partir de vos propres mots.",
  }[profile.origin];
  const valid = profile.name.trim().length >= 2 && profile.summary.trim().length >= 10;
  return (
    <form
      className={s.form}
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && !saving) onConfirm();
      }}
    >
      <div className={s.orbiLine}>
        <Orbi mood="done" size={48} />
        <p>
          Voici ce qu’Orbi a compris. <span className={s.muted}>{origin}</span>
        </p>
      </div>
      <label>
        Nom de l’entreprise
        <input
          value={profile.name}
          onChange={(e) => setProfile({ ...profile, name: e.target.value })}
          required
          minLength={2}
          maxLength={120}
        />
      </label>
      <label>
        <span>
          Résumé proposé <span className={s.optional}>— corrigez-le si besoin</span>
        </span>
        <textarea
          value={profile.summary}
          onChange={(e) => setProfile({ ...profile, summary: e.target.value })}
          required
          minLength={10}
          maxLength={1800}
          rows={4}
        />
      </label>
      {profile.facts.length > 0 && (
        <fieldset className={s.facts}>
          <legend>Ce que disent vos sources</legend>
          {profile.facts.map((fact, i) => (
            <div key={i} className={s.fact} data-kept={kept[i]}>
              <blockquote>
                <span className={s.factLabel}>{fact.label}</span>
                {fact.quote}
                {fact.sourceUrl && (
                  <a href={fact.sourceUrl} target="_blank" rel="noreferrer noopener" className={s.source}>
                    Source : {new URL(fact.sourceUrl).hostname}
                  </a>
                )}
              </blockquote>
              <label className={s.check}>
                <input
                  type="checkbox"
                  checked={kept[i] ?? true}
                  onChange={(e) => setKept(kept.map((k, j) => (j === i ? e.target.checked : k)))}
                />
                Garder
              </label>
            </div>
          ))}
        </fieldset>
      )}
      <section className={s.unknowns} aria-label="Ce qu’Orbi ne devine pas">
        <h3>Ce qu’Orbi ne devine pas</h3>
        <ul>
          {profile.unknowns.map((u) => (
            <li key={u}>{u}</li>
          ))}
        </ul>
        <p className={s.fine}>
          Dans vos brouillons, ces points apparaîtront comme des questions surlignées, jamais comme des réponses inventées.
        </p>
      </section>
      {saveError && (
        <p className={s.alert} role="alert">
          {saveError}
        </p>
      )}
      <div className={s.actions}>
        <button type="button" className={s.secondary} onClick={onRestart} disabled={saving}>
          Recommencer
        </button>
        <button className={s.primary} disabled={!valid || saving}>
          {saving ? "Enregistrement…" : authed ? "C’est bien mon entreprise" : "C’est bien mon entreprise, continuer"}
        </button>
      </div>
    </form>
  );
}

// ------------------------------------------- step 1, confirmed: instant preview

function PreviewStep({
  profile,
  onContinue,
  onEdit,
}: {
  profile: StartProfile;
  onContinue: () => void;
  onEdit: () => void;
}) {
  const [preview, setPreview] = useState<StartPreview | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    // Deferred: a Strict Mode double-mount cancels the first request before it is sent.
    const timer = setTimeout(async () => {
      let result: StartPreview;
      try {
        const response = await fetch("/api/v1/start/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile }),
          signal: controller.signal,
        });
        const body = await json<{ preview?: StartPreview }>(response);
        result = response.ok && body.preview ? body.preview : quotePreview(profile, "error");
      } catch {
        if (controller.signal.aborted) return;
        result = quotePreview(profile, "error");
      }
      if (controller.signal.aborted) return;
      setPreview(result);
      writePreviewShown(result.mode === "ai");
    }, 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [profile]);

  // Opened by the confirm click (never on reload): move focus to the result once it exists.
  useEffect(() => {
    if (preview) headingRef.current?.focus();
  }, [preview]);

  const host = profile.website ? new URL(profile.website).hostname : null;
  return (
    <div className={s.form}>
      <p>
        Profil de <strong>{profile.name}</strong> confirmé.{" "}
        <button type="button" className={s.link} onClick={onEdit}>
          Modifier le profil
        </button>
      </p>
      {!preview ? (
        <div className={s.working} role="status">
          <Orbi mood="thinking" size={56} working />
          <span>Orbi prépare ce que vos clients vous demandent probablement…</span>
        </div>
      ) : preview.mode === "ai" ? (
        <section className={s.preview} aria-labelledby="start-preview-title">
          <h3 id="start-preview-title" ref={headingRef} tabIndex={-1}>
            Ce que vos clients vous demandent probablement
          </h3>
          <p className={s.fine}>
            Questions proposées par Orbi à partir de {host ? `votre page ${host}` : "votre description"}. Une réponse
            n’apparaît que si elle figure mot pour mot dans {host ? "votre site" : "vos mots"}.
          </p>
          <ol className={s.likely}>
            {preview.questions.map((q, i) => (
              <li key={i}>
                <strong>{q.question}</strong>
                {q.answer ? (
                  <blockquote>
                    {q.answer.quote}
                    {q.answer.sourceUrl ? (
                      <a href={q.answer.sourceUrl} target="_blank" rel="noreferrer noopener" className={s.source}>
                        Source : {q.answer.sourceName}
                      </a>
                    ) : (
                      <span className={s.source}>Source : {q.answer.sourceName}</span>
                    )}
                  </blockquote>
                ) : (
                  <p className={s.missing}>{NOT_FOUND_LABEL}</p>
                )}
              </li>
            ))}
          </ol>
          {preview.flags.includes("source_instructions_ignored") && (
            <p className={s.fine}>
              Votre page contient un texte qui ressemble à des instructions : Orbi l’a traité comme du contenu, sans
              l’exécuter.
            </p>
          )}
          {preview.examples.length > 0 && (
            <>
              <h3>À quoi ressemblent ses brouillons</h3>
              <p className={s.fine}>
                Deux mails imaginés pour l’exemple, et les brouillons qu’Orbi préparerait avec les mêmes règles que pour
                votre vraie boîte. Rien n’est lu ni envoyé.
              </p>
              {preview.examples.map((ex, i) => (
                <article key={i} className={s.example} aria-label={`Exemple ${i + 1} : ${ex.label}`}>
                  <div className={s.incoming}>
                    <span className={s.simulated}>{ex.incoming.label}</span>
                    <dl>
                      <dt>De</dt>
                      <dd>{ex.incoming.from}</dd>
                      <dt>À</dt>
                      <dd>{ex.incoming.to}</dd>
                      <dt>Objet</dt>
                      <dd>{ex.incoming.subject}</dd>
                    </dl>
                    <p className={s.draftBody}>{ex.incoming.body}</p>
                  </div>
                  <div className={s.draft}>
                    <header>
                      <span className={s.simulated}>Brouillon d’exemple · {ex.draft.label}</span>
                    </header>
                    <p className={s.draftBody}>
                      {splitPlaceholders(ex.draft.body).map((part, j) =>
                        part.placeholder ? (
                          <mark key={j} className={s.placeholder}>
                            {part.text}
                          </mark>
                        ) : (
                          <span key={j}>{part.text}</span>
                        ),
                      )}
                    </p>
                    {ex.draft.questions.length > 0 && (
                      <div className={s.questions}>
                        <h4>À confirmer avant d’envoyer</h4>
                        <ul>
                          {ex.draft.questions.map((q) => (
                            <li key={q}>{q}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {ex.draft.citations.length > 0 && (
                      <details className={s.sources}>
                        <summary>Sources ({ex.draft.citations.length})</summary>
                        <ul>
                          {ex.draft.citations.map((c, j) => (
                            <li key={j}>
                              <strong>{c.sourceName}</strong>
                              <blockquote>{c.excerpt}</blockquote>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                </article>
              ))}
            </>
          )}
        </section>
      ) : (
        <section className={s.preview} aria-labelledby="start-preview-title">
          <h3 id="start-preview-title" ref={headingRef} tabIndex={-1}>
            Ce qu’Orbi peut déjà citer dans une réponse
          </h3>
          <p className={s.fine}>
            {preview.reason === "disabled"
              ? "Lecture directe : uniquement des citations exactes de vos sources, sans interprétation."
              : "L’aperçu détaillé n’est pas disponible pour le moment. Voici uniquement des citations exactes de vos sources."}{" "}
            Les brouillons d’exemple apparaîtront avec vos vrais mails.
          </p>
          {preview.found.length > 0 ? (
            <ul className={s.likely}>
              {preview.found.map((f, i) => (
                <li key={i}>
                  <blockquote>
                    <span className={s.factLabel}>{f.label}</span>
                    {f.quote}
                  </blockquote>
                </li>
              ))}
            </ul>
          ) : (
            <p className={s.muted}>Aucune citation conservée dans votre profil.</p>
          )}
          <div className={s.unknowns}>
            <h3>Ce qu’Orbi ne devine pas</h3>
            <ul>
              {preview.unknowns.map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
            <p className={s.fine}>Orbi vous posera chacune de ces questions une seule fois, au lieu d’inventer.</p>
          </div>
        </section>
      )}
      <div className={s.actions}>
        <button type="button" className={s.primary} onClick={onContinue}>
          Brancher ma boîte pour de vrai
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ step 2

function AccountStep({ profileName, onEdit }: { profileName: string; onEdit: () => void }) {
  const [mode, setMode] = useState<"sign-up" | "sign-in">("sign-up");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState(false);
  const signup = mode === "sign-up";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password"), returnTo: "/start" }),
      });
      const result = await json<{ confirmationRequired?: boolean }>(response);
      if (!response.ok)
        setMessage(
          response.status === 503
            ? "La création de compte n’est pas disponible sur ce déploiement."
            : signup
              ? "Création impossible. Vérifiez l’adresse et un mot de passe de 12 caractères minimum, ou connectez-vous."
              : "Connexion impossible. Vérifiez vos identifiants et la confirmation de votre adresse.",
        );
      else if (result.confirmationRequired) setConfirmation(true);
      // Full reload: the server page must re-render with the new session cookies.
      else window.location.reload();
    } catch {
      setMessage("Connexion au service impossible. Réessayez.");
    } finally {
      setBusy(false);
    }
  }
  if (confirmation)
    return (
      <div className={s.form} role="status">
        <p>
          <strong>Confirmez votre adresse.</strong> Ouvrez l’e-mail reçu : le lien vous ramène ici, à l’étape suivante.
        </p>
        <p className={s.fine}>
          Le profil de {profileName} reste enregistré sur cet appareil pendant 24 heures, jamais dans un lien.
        </p>
      </div>
    );
  return (
    <form onSubmit={submit} className={s.form}>
      <p>
        Le profil de <strong>{profileName}</strong> est prêt. Il sera enregistré dans votre espace dès que votre compte
        existe.{" "}
        <button type="button" className={s.link} onClick={onEdit}>
          Modifier le profil
        </button>
      </p>
      <div className={s.switch} role="group" aria-label="Type d’accès">
        <button type="button" aria-pressed={signup} onClick={() => setMode("sign-up")}>
          Créer un compte
        </button>
        <button type="button" aria-pressed={!signup} onClick={() => setMode("sign-in")}>
          J’ai déjà un compte
        </button>
      </div>
      <label>
        E-mail professionnel
        <input name="email" type="email" autoComplete="email" required maxLength={254} />
      </label>
      <label>
        Mot de passe
        <input
          name="password"
          type="password"
          autoComplete={signup ? "new-password" : "current-password"}
          required
          minLength={signup ? 12 : 1}
          maxLength={1024}
          aria-describedby={signup ? "start-password-hint" : undefined}
        />
        {signup && (
          <span id="start-password-hint" className={s.fine}>
            12 caractères minimum.
          </span>
        )}
      </label>
      {message && (
        <p className={s.alert} role="alert">
          {message}
        </p>
      )}
      <div className={s.actions}>
        <button className={s.primary} disabled={busy}>
          {busy ? "Un instant…" : signup ? "Créer mon compte" : "Me connecter"}
        </button>
      </div>
      <p className={s.fine}>Le profil est conservé sur cet appareil pendant 24 heures au plus, jamais dans un lien.</p>
    </form>
  );
}

// ------------------------------------------------------------------ step 3

function MailboxStep({
  readiness,
  status,
  returnedFrom,
  onVerify,
  onRecheck,
}: {
  readiness: Readiness;
  status: Record<Provider, MailboxStatus>;
  returnedFrom: Provider | null;
  onVerify: (p: Provider) => void;
  onRecheck: () => void;
}) {
  const [busy, setBusy] = useState<Provider | null>(null);
  const [error, setError] = useState("");
  const configured = PROVIDERS.filter((p) => readiness.providers[p.id].configured);
  async function connect(provider: Provider) {
    setBusy(provider);
    setError("");
    try {
      const response = await fetch("/api/v1/start/mailbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, action: "connect" }),
      });
      const body = await json<{ redirectUrl?: string }>(response);
      if (!response.ok || !body.redirectUrl) throw new Error(body.error ?? "L’autorisation n’a pas pu démarrer.");
      window.location.assign(body.redirectUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "L’autorisation n’a pas pu démarrer.");
      setBusy(null);
    }
  }
  return (
    <div className={s.form}>
      {!readiness.inbox.enabled && (
        <p className={s.notice}>
          Les brouillons ne sont pas encore activés sur ce déploiement. Vous pouvez connecter votre boîte : le premier
          passage sera proposé dès l’activation.
        </p>
      )}
      <div className={s.scope}>
        <div>
          <h3>Ce qu’Orbis peut faire</h3>
          <ul>
            <li>Lire les messages reçus ces 14 derniers jours (50 au plus).</li>
            <li>Lire quelques-uns de vos messages envoyés, pour le ton et la signature.</li>
            <li>Créer des brouillons de réponse dans le fil, adressés à l’expéditeur.</li>
          </ul>
        </div>
        <div>
          <h3>Ce qu’Orbis ne fait jamais</h3>
          <ul>
            <li>Envoyer, transférer, supprimer ou déplacer un message.</li>
            <li>Écrire à quelqu’un d’autre que l’expéditeur.</li>
            <li>Modifier vos règles, filtres ou dossiers.</li>
          </ul>
        </div>
      </div>
      <p className={s.fine}>
        Les autorisations Google (lecture et rédaction) et Microsoft (lecture et écriture des messages) permettraient
        techniquement d’envoyer : c’est le code d’Orbis qui ne contient aucune action d’envoi, et chaque appel est vérifié
        contre cette liste.
      </p>
      {configured.length === 0 ? (
        <Blocker kind={readiness.session === "offline" ? "offline" : "no_provider"} onRetry={onRecheck} />
      ) : (
        <div className={s.providers}>
          {PROVIDERS.map((p) => {
            const ok = readiness.providers[p.id].configured;
            const st = status[p.id];
            return (
              <div key={p.id} className={s.provider} data-status={st}>
                <ToolLogo tool={p.id} size={28} />
                <div className={s.providerBody}>
                  <strong>{p.name}</strong>
                  <span className={s.muted} role="status">
                    {!ok
                      ? "Non configuré sur ce déploiement"
                      : st === "checking"
                        ? "Vérification côté serveur…"
                        : st === "connected"
                          ? "Connexion vérifiée"
                          : st === "error"
                            ? "Vérification impossible pour l’instant"
                            : returnedFrom === p.id && st === "not_connected"
                              ? "Aucune connexion active trouvée. L’autorisation a peut-être été annulée."
                              : "Non connecté"}
                  </span>
                </div>
                {ok && st !== "connected" && (
                  <div className={s.providerActions}>
                    {(st === "error" || returnedFrom === p.id) && (
                      <button type="button" className={s.secondary} onClick={() => onVerify(p.id)} disabled={st === "checking"}>
                        Vérifier la connexion
                      </button>
                    )}
                    <button
                      type="button"
                      className={s.primary}
                      onClick={() => void connect(p.id)}
                      disabled={busy !== null || st === "checking"}
                    >
                      {busy === p.id ? "Redirection…" : `Connecter ${p.name}`}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {error && (
        <p className={s.alert} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ step 4

function Blocker({ kind, detail, onRetry }: { kind: BlockerKind; detail?: string; onRetry?: () => void }) {
  const copy = BLOCKER_COPY[kind];
  return (
    <div className={s.blocker} role="alert">
      <strong>{copy.title}</strong>
      <p>{copy.action}</p>
      {detail && <p className={s.fine}>{detail}</p>}
      {onRetry && (
        <button type="button" className={s.secondary} onClick={onRetry}>
          Revérifier
        </button>
      )}
    </div>
  );
}

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function DraftsStep({
  readiness,
  provider,
  batch,
  messages,
  loadInbox,
  onRecheck,
}: {
  readiness: Readiness;
  provider: Provider | null;
  batch: InboxBatchView | null;
  messages: InboxMessageView[];
  loadInbox: (batchId?: string) => Promise<{ ok: true; batch: InboxBatchView | null } | { ok: false; status: number; error: string }>;
  onRecheck: () => void;
}) {
  const [starting, setStarting] = useState(false);
  const [blocker, setBlocker] = useState<{ kind: BlockerKind; detail?: string } | null>(null);
  const [queuedSince] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const testMode = readiness.inbox.mode !== "scoped_autonomy";

  const preBlocker: BlockerKind | null =
    readiness.session === "offline"
      ? "offline"
      : !readiness.inbox.enabled
        ? "flag_disabled"
        : !readiness.inbox.budgetConfigured
          ? "budget_missing"
          : !readiness.inbox.aiConfigured
            ? "ai_not_configured"
            : null;

  // Poll only while the backend reports a pending batch; pause when the tab is hidden.
  const pending = batch ? isPending(batch.status) : false;
  const batchId = batch?.id;
  useEffect(() => {
    if (!pending || !batchId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState === "visible") {
        setNow(Date.now());
        const result = await loadInbox(batchId).catch(() => null);
        if (result && !result.ok) setBlocker({ kind: inboxErrorKind(result.status, result.error), detail: result.error });
      }
      if (!stopped) timer = setTimeout(tick, 3000);
    };
    timer = setTimeout(tick, 3000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [pending, batchId, loadInbox]);

  async function start(fresh = false) {
    if (!provider || starting) return;
    setStarting(true);
    setBlocker(null);
    const store = storage("session");
    let key: string | null = null;
    try {
      key = fresh ? null : (store?.getItem(`${INBOX_KEY}:${provider}`) ?? null);
    } catch {}
    // Same key on retry after a network failure: the server returns the same batch.
    key ??= newKey();
    try {
      store?.setItem(`${INBOX_KEY}:${provider}`, key);
    } catch {}
    try {
      const response = await fetch("/api/v1/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify({ provider }),
      });
      const body = await json<InboxBatchView>(response);
      if (!response.ok) {
        setBlocker({ kind: inboxErrorKind(response.status, body.error), detail: body.error });
        return;
      }
      try {
        store?.removeItem(`${INBOX_KEY}:${provider}`);
      } catch {}
      await loadInbox(body.id);
    } catch {
      setBlocker({ kind: "unknown" });
    } finally {
      setStarting(false);
    }
  }

  if (preBlocker && !batch) return <Blocker kind={preBlocker} onRetry={onRecheck} />;

  const testBanner = testMode && (
    <p className={s.test} role="note">
      <strong>Mode test.</strong> Les brouillons ci-dessous sont simulés : rien n’est écrit dans votre boîte mail, et rien
      n’est envoyé.
    </p>
  );

  if (!batch)
    return (
      <div className={s.form}>
        {testBanner}
        <PlanBanner />
        <p>
          Orbi lit les messages reçus ces 14 derniers jours, écarte les newsletters et notifications, puis prépare des
          brouillons pour les demandes de clients et de devis. Le nombre de brouillons du premier passage est limité.
        </p>
        {blocker && <Blocker kind={blocker.kind} detail={blocker.detail} onRetry={onRecheck} />}
        <div className={s.actions}>
          <button type="button" className={s.primary} onClick={() => void start()} disabled={!provider || starting}>
            {starting ? "Mise en file…" : "Préparer mes premiers brouillons"}
          </button>
        </div>
        {!provider && <p className={s.fine}>Connectez et vérifiez d’abord une boîte mail.</p>}
      </div>
    );

  const phase = progressPhase(batch, messages);
  if (pending) {
    const drafted = messages.filter((m) => m.status === "drafted").length;
    return (
      <div className={s.form}>
        {testBanner}
        <div className={s.working} role="status" aria-live="polite">
          <Orbi mood="thinking" size={64} working />
          <div>
            <strong>
              {phase === "queued"
                ? "En file d’attente"
                : phase === "drafting"
                  ? "Rédaction d’un brouillon…"
                  : "Lecture et tri des messages…"}
            </strong>
            <p className={s.muted}>
              {phase === "queued"
                ? "Le traitement démarre dès qu’il est pris en charge."
                : `${messages.length} message${messages.length > 1 ? "s" : ""} examiné${messages.length > 1 ? "s" : ""}, ${drafted} brouillon${drafted > 1 ? "s" : ""} prêt${drafted > 1 ? "s" : ""} pour l’instant.`}
            </p>
          </div>
        </div>
        {phase === "queued" && now - queuedSince > 90_000 && (
          <p className={s.notice}>
            Le lot attend toujours d’être pris en charge. Vous pouvez quitter cette page : vos résultats s’afficheront ici
            à votre retour.
          </p>
        )}
        {blocker && <Blocker kind={blocker.kind} detail={blocker.detail} />}
      </div>
    );
  }

  return (
    <Results
      batch={batch}
      messages={messages}
      testBanner={testBanner}
      onRetry={() => void start(true)}
      starting={starting}
      blocker={blocker}
    />
  );
}

function Results({
  batch,
  messages,
  testBanner,
  onRetry,
  starting,
  blocker,
}: {
  batch: InboxBatchView;
  messages: InboxMessageView[];
  testBanner: ReactNode;
  onRetry: () => void;
  starting: boolean;
  blocker: { kind: BlockerKind; detail?: string } | null;
}) {
  const summary = summarizeResults(batch, messages);
  const mailbox = batch.provider === "gmail" ? "Gmail" : "Outlook";
  const leftAside =
    summary.skipped.length > 0 ||
    summary.notActionable.length > 0 ||
    summary.awaitingQuota > 0 ||
    summary.failed > 0;
  return (
    <div className={s.form}>
      {testBanner}
      <PlanBanner refreshKey={`${batch.id}:${batch.status}`} />
      {(batch.status === "quota_reached" || batch.status === "plan_inactive") && (
        <div className={s.blocker} role="alert">
          <strong>{batch.status === "quota_reached" ? "Quota atteint." : "Aucun nouveau traitement avec votre formule actuelle."}</strong>
          <p>
            {batch.error ??
              "Orbi s’est arrêté avant tout nouvel appel au modèle. Les résultats ci-dessous sont conservés."}{" "}
            <Link href="/billing">Voir les formules</Link>
          </p>
        </div>
      )}
      {batch.status === "budget_exhausted" && (
        <div className={s.blocker} role="alert">
          <strong>Plafond de dépense atteint.</strong>
          <p>
            Orbi s’est arrêté avant de dépasser le budget mensuel. Les résultats ci-dessous sont partiels ; le traitement
            reprendra quand le plafond sera relevé ou au mois suivant.
          </p>
        </div>
      )}
      {batch.status === "failed" && (
        <div className={s.blocker} role="alert">
          <strong>Le passage n’a pas abouti.</strong>
          <p>{batch.error ?? "Rien n’a été envoyé. Reconnectez votre boîte si besoin, puis relancez."}</p>
          <button type="button" className={s.secondary} onClick={onRetry} disabled={starting}>
            {starting ? "Mise en file…" : "Relancer un passage"}
          </button>
        </div>
      )}
      {blocker && <Blocker kind={blocker.kind} detail={blocker.detail} />}
      {summary.drafts.length > 0 ? (
        <div className={s.orbiLine}>
          <Orbi mood="done" size={48} />
          <p>
            <strong>
              {summary.drafts.length} brouillon{summary.drafts.length > 1 ? "s" : ""} prêt
              {summary.drafts.length > 1 ? "s" : ""} à relire.
            </strong>{" "}
            <span className={s.muted}>Les passages surlignés sont des questions à confirmer avant tout envoi.</span>
          </p>
        </div>
      ) : (
        batch.status === "completed" && (
          <div className={s.notice}>
            <strong>Aucune demande client à laquelle répondre sur la période.</strong>
            <p>Orbi n’a trouvé aucun message qui appelle une réponse de votre part. Voici ce qui a été écarté, et pourquoi.</p>
          </div>
        )
      )}
      {summary.drafts.map((m) => (
        <DraftCard key={m.id} message={m} mailbox={mailbox} />
      ))}
      {summary.review.length > 0 && (
        <section className={`${s.aside} ${s.reviewList}`} aria-label="À vérifier par vous">
          <h3>À vérifier par vous ({summary.review.length})</h3>
          <ul>
            {summary.review.map((m) => (
              <li key={m.id}>
                {m.subjectPreview ?? "Message sans objet"}
                {[...new Set(m.flags.map(flagLabel).filter(Boolean))].map((label) => (
                  <span key={label} className={s.muted}>
                    {" "}
                    — {label}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </section>
      )}
      {leftAside && (
        <section className={s.aside} aria-label="Messages laissés de côté">
          <h3>Laissés de côté</h3>
          <ul>
            {summary.skipped.map((x) => (
              <li key={x.reason}>
                <span>{x.label}</span>
                <span className={s.count}>{x.count}</span>
              </li>
            ))}
            {summary.notActionable.map((x) => (
              <li key={x.classification}>
                <span>Classés « {x.label} » : pas de réponse proposée</span>
                <span className={s.count}>{x.count}</span>
              </li>
            ))}
            {summary.awaitingQuota > 0 && (
              <li>
                <span>Demandes en attente : limite de brouillons du premier passage</span>
                <span className={s.count}>{summary.awaitingQuota}</span>
              </li>
            )}
            {summary.failed > 0 && (
              <li>
                <span>Non traités à cause d’une erreur, repris au prochain passage</span>
                <span className={s.count}>{summary.failed}</span>
              </li>
            )}
          </ul>
        </section>
      )}
      {batch.status === "completed" && <ContinuousToggle />}
      <div className={s.actions}>
        <Link href="/today" className={s.secondary}>
          Aller à mon espace
        </Link>
      </div>
    </div>
  );
}
