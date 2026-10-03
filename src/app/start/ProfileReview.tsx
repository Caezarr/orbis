"use client";

import { useId, useState, type CSSProperties } from "react";
import { OrbiSays } from "@/components/product/OrbiSays";
import {
  CATEGORY_LABELS,
  FACT_CATEGORIES,
  sourceName,
  UNKNOWN_BY_CATEGORY,
  type FactCategory,
  type StartFact,
  type StartProfile,
} from "@/lib/start/flow";
import s from "./start.module.css";
import p from "./profile.module.css";

/*
 * Step 1 result: what Orbi understood, grouped by category, each fact with its
 * exact quote, source page and confidence. The owner can drop a fact, correct
 * it, or answer what was not found. Everything stays local until the profile is
 * confirmed (then saved with the account, see /api/v1/start/profile).
 */

const VISIBLE_PER_CATEGORY = 4;
const VIA_LABEL: Partial<Record<NonNullable<StartFact["via"]>, string>> = {
  structured: "Données structurées du site",
  meta: "Description du site",
  link: "Lien du site",
  owner: "Indiqué par vous",
};

export function ProfileReview({
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
    ai: "Résumé rédigé par Orbi uniquement à partir des informations ci-dessous, chacune citée mot pour mot.",
    site: "Lecture directe de votre site : des citations exactes, sans interprétation.",
    description: "À partir de vos propres mots.",
  }[profile.origin];
  const valid = profile.name.trim().length >= 2 && profile.summary.trim().length >= 10;
  const indexed = profile.facts.map((fact, index) => ({ fact, index }));
  const groups = FACT_CATEGORIES.map((category) => ({
    category,
    items: indexed.filter(({ fact }) => fact.category === category),
  })).filter((g) => g.items.length > 0);
  const legacy = indexed.filter(({ fact }) => !fact.category);
  const pageCount = profile.pages?.length ?? (profile.website ? 1 : 0);
  const keptCount = kept.filter(Boolean).length;
  const seconds = profile.readMs ? Math.max(1, Math.round(profile.readMs / 1000)) : null;

  const updateFact = (index: number, next: StartFact) =>
    setProfile({ ...profile, facts: profile.facts.map((f, i) => (i === index ? next : f)) });
  const answerUnknown = (unknown: string, answer: string) => {
    const category = (Object.entries(UNKNOWN_BY_CATEGORY).find(([, label]) => label === unknown)?.[0] ??
      undefined) as FactCategory | undefined;
    const fact: StartFact = {
      label: category ? CATEGORY_LABELS[category] : unknown.slice(0, 80),
      quote: answer,
      value: answer.slice(0, 300),
      via: "owner",
      ...(category ? { category } : {}),
    };
    setProfile({ ...profile, facts: [...profile.facts, fact], unknowns: profile.unknowns.filter((u) => u !== unknown) });
    setKept([...kept, true]);
  };

  return (
    <form
      className={s.form}
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && !saving) onConfirm();
      }}
    >
      <OrbiSays mood="done">
        <p>
          Voici ce que j’ai compris de votre entreprise.{" "}
          {profile.origin !== "description" && profile.facts.length > 0 && (
            <strong>
              {profile.facts.length} information{profile.facts.length > 1 ? "s" : ""} trouvée
              {profile.facts.length > 1 ? "s" : ""}
              {pageCount > 0 && ` sur ${pageCount} page${pageCount > 1 ? "s" : ""}`}
              {seconds && ` en ${seconds} s`}.
            </strong>
          )}{" "}
          <span className={s.muted}>{origin}</span>
        </p>
      </OrbiSays>

      {profile.flags?.includes("source_instructions_ignored") && (
        <p className={s.fine}>
          Votre site contient un texte qui ressemble à des instructions pour une IA : Orbi l’a ignoré, il ne figure
          dans aucune information ci-dessous.
        </p>
      )}

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
          Résumé proposé <span className={s.optional}>(corrigez-le si besoin)</span>
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

      {groups.length > 0 && (
        <section className={p.groups} aria-label="Ce que dit votre site">
          <header className={p.groupsHead}>
            <h3>Ce que dit votre site</h3>
            <p className={s.fine}>
              Décochez ce qui est faux ou dépassé, corrigez ce qui a changé. Orbi ne s’appuiera que sur ce que vous
              gardez. {keptCount} sur {profile.facts.length} gardée{keptCount > 1 ? "s" : ""}.
            </p>
          </header>
          {groups.map((g, gi) => (
            <CategoryCard
              key={g.category}
              category={g.category}
              items={g.items}
              kept={kept}
              order={gi}
              highlighted={profile.summarySources}
              onKeep={(index, value) => setKept(kept.map((k, j) => (j === index ? value : k)))}
              onUpdate={updateFact}
            />
          ))}
        </section>
      )}

      {legacy.length > 0 && (
        <fieldset className={s.facts}>
          <legend>Ce que disent vos sources</legend>
          {legacy.map(({ fact, index }) => (
            <div key={index} className={s.fact} data-kept={kept[index]}>
              <blockquote>
                <span className={s.factLabel}>{fact.label}</span>
                {fact.quote}
              </blockquote>
              <label className={s.check}>
                <input
                  type="checkbox"
                  checked={kept[index] ?? true}
                  onChange={(e) => setKept(kept.map((k, j) => (j === index ? e.target.checked : k)))}
                />
                Garder
              </label>
            </div>
          ))}
        </fieldset>
      )}

      {profile.pages && profile.pages.length > 0 && (
        <details className={p.pages}>
          <summary>Pages lues ({profile.pages.length})</summary>
          <ul>
            {profile.pages.map((page) => (
              <li key={page.url}>
                <a href={page.url} target="_blank" rel="noreferrer noopener">
                  {sourceName(page.url)}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}

      <Unknowns unknowns={profile.unknowns} onAnswer={answerUnknown} />

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

function CategoryCard({
  category,
  items,
  kept,
  order,
  highlighted,
  onKeep,
  onUpdate,
}: {
  category: FactCategory;
  items: { fact: StartFact; index: number }[];
  kept: boolean[];
  order: number;
  highlighted?: string[];
  onKeep: (index: number, value: boolean) => void;
  onUpdate: (index: number, fact: StartFact) => void;
}) {
  const [open, setOpen] = useState(false);
  const headingId = useId();
  const visible = open ? items : items.slice(0, VISIBLE_PER_CATEGORY);
  return (
    <section className={p.card} style={{ "--i": order } as CSSProperties} aria-labelledby={headingId}>
      <h4 id={headingId}>
        {CATEGORY_LABELS[category]} <span className={p.count}>{items.length}</span>
      </h4>
      <ul>
        {visible.map(({ fact, index }) => (
          <FactRow
            key={index}
            fact={fact}
            kept={kept[index] ?? true}
            cited={!!fact.id && !!highlighted?.includes(fact.id)}
            onKeep={(v) => onKeep(index, v)}
            onUpdate={(f) => onUpdate(index, f)}
          />
        ))}
      </ul>
      {items.length > VISIBLE_PER_CATEGORY && (
        <button type="button" className={s.link} onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? "Afficher moins" : `Afficher les ${items.length - VISIBLE_PER_CATEGORY} autres`}
        </button>
      )}
    </section>
  );
}

function FactRow({
  fact,
  kept,
  cited,
  onKeep,
  onUpdate,
}: {
  fact: StartFact;
  kept: boolean;
  cited: boolean;
  onKeep: (v: boolean) => void;
  onUpdate: (f: StartFact) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(fact.corrected ?? fact.value ?? fact.quote);
  const inputId = useId();
  const value = fact.value ?? fact.quote;
  const showQuote = fact.via === "text" || fact.via === "meta" ? fact.quote !== value : false;
  const via = fact.via ? VIA_LABEL[fact.via] : undefined;
  const isLink = /^https?:\/\//.test(fact.quote) && fact.via === "link";
  return (
    <li className={p.fact} data-kept={kept}>
      <div className={p.factBody}>
        <span className={p.factLabel}>
          {fact.label}
          {fact.confidence === "medium" && <span className={p.check}>à vérifier</span>}
          {cited && <span className={p.cited}>cité dans le résumé</span>}
        </span>
        {fact.corrected ? (
          <span className={p.value}>
            {fact.corrected} <span className={p.corrected}>corrigé par vous</span>
          </span>
        ) : isLink ? (
          <a className={p.value} href={fact.quote} target="_blank" rel="noreferrer noopener">
            {value}
          </a>
        ) : (
          <span className={p.value}>{value}</span>
        )}
        {showQuote && <blockquote className={p.quote}>« {fact.quote} »</blockquote>}
        <span className={p.meta}>
          {fact.sourceUrl ? (
            <a href={fact.sourceUrl} target="_blank" rel="noreferrer noopener">
              Source : {sourceName(fact.sourceUrl)}
            </a>
          ) : (
            fact.via === "owner" && <span>Source : vous</span>
          )}
          {via && fact.via !== "owner" && <span>{via}</span>}
        </span>
        {editing && (
          <div className={p.edit}>
            <label htmlFor={inputId} className={s.srOnly}>
              Correction pour « {fact.label} »
            </label>
            <input
              id={inputId}
              value={draft}
              maxLength={600}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const v = draft.trim();
                  onUpdate({ ...fact, corrected: v && v !== value ? v : undefined });
                  setEditing(false);
                }
                if (e.key === "Escape") setEditing(false);
              }}
              autoFocus
            />
            <button
              type="button"
              className={s.secondary}
              onClick={() => {
                const v = draft.trim();
                onUpdate({ ...fact, corrected: v && v !== value ? v : undefined });
                setEditing(false);
              }}
            >
              Valider
            </button>
          </div>
        )}
      </div>
      <div className={p.factActions}>
        <label className={p.keep}>
          <input type="checkbox" checked={kept} onChange={(e) => onKeep(e.target.checked)} />
          Garder
        </label>
        {!editing && fact.via !== "owner" && (
          <button type="button" className={s.link} onClick={() => setEditing(true)}>
            {fact.corrected ? "Modifier" : "Corriger"}
          </button>
        )}
        {fact.corrected && !editing && (
          <button type="button" className={s.link} onClick={() => onUpdate({ ...fact, corrected: undefined })}>
            Annuler la correction
          </button>
        )}
      </div>
    </li>
  );
}

function Unknowns({ unknowns, onAnswer }: { unknowns: string[]; onAnswer: (unknown: string, answer: string) => void }) {
  const [active, setActive] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const inputId = useId();
  if (!unknowns.length)
    return (
      <section className={s.unknowns} aria-label="Ce qu’Orbi ne devine pas">
        <h3>Ce qu’Orbi ne devine pas</h3>
        <p className={s.fine}>
          Orbi a trouvé une réponse sourcée pour chaque point qu’il cherche. Tout ce qui manquera dans un vrai mail
          apparaîtra comme une question surlignée, jamais comme une réponse inventée.
        </p>
      </section>
    );
  const submit = (u: string) => {
    const v = answer.trim();
    if (v.length >= 2) onAnswer(u, v);
    setActive(null);
    setAnswer("");
  };
  return (
    <section className={s.unknowns} aria-label="Ce qu’Orbi ne devine pas">
      <h3>Ce qu’Orbi ne devine pas</h3>
      <p className={s.fine}>Introuvable sur votre site. Complétez maintenant, ou Orbi vous le demandera une seule fois.</p>
      <ul className={p.unknownList}>
        {unknowns.map((u) => (
          <li key={u}>
            <mark className={s.placeholder}>À CONFIRMER</mark> {u}
            {active === u ? (
              <span className={p.edit}>
                <label htmlFor={inputId} className={s.srOnly}>
                  {u}
                </label>
                <input
                  id={inputId}
                  value={answer}
                  maxLength={600}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submit(u);
                    }
                    if (e.key === "Escape") setActive(null);
                  }}
                  autoFocus
                />
                <button type="button" className={s.secondary} onClick={() => submit(u)}>
                  Ajouter
                </button>
              </span>
            ) : (
              <>
                {" "}
                <button
                  type="button"
                  className={s.link}
                  onClick={() => {
                    setActive(u);
                    setAnswer("");
                  }}
                >
                  Je complète
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
