"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { departments, findFlow } from "@/lib/product/catalog";
import type { AuditInput } from "@/lib/product/audit";
import s from "./product.module.css";
export function Audit({
  flowId,
  audience,
  website,
  fromDescription,
  seats,
}: {
  flowId?: string;
  audience?: string;
  website?: string;
  fromDescription?: boolean;
  seats?: number;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [intakeNotice, setIntakeNotice] = useState("");
  const [form, setForm] = useState<AuditInput>({
    seats,
    company: "",
    description: "",
    department: findFlow(flowId ?? "")?.department ?? departments[0],
    tools: "",
    volume: "",
    success: "",
    constraints: "",
    budget: 200,
    audience: audience === "integrator" ? "integrator" : "company",
  });
  const update = <K extends keyof AuditInput>(key: K, value: AuditInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        if (website) {
          const site = JSON.parse(
            sessionStorage.getItem("orbis:site-intake") ?? "null",
          );
          if (site?.website === website) {
            setForm((f) => ({
              ...f,
              website,
              company: String(site.title ?? "").slice(0, 120),
              description: String(site.description || site.excerpt || "").slice(
                0,
                4000,
              ),
            }));
            setIntakeNotice(
              "La page publique a été lue. Confirmez ou corrigez les informations avant de continuer : le texte du site n’est pas une vérification de vos offres.",
            );
          }
        }
        if (fromDescription) {
          const text = sessionStorage.getItem("orbis:text-intake");
          if (text)
            setForm((f) => ({ ...f, description: text.slice(0, 4000) }));
        }
      } catch {
        setIntakeNotice(
          "Le contexte n’a pas pu être restauré. Décrivez votre activité pour continuer.",
        );
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [website, fromDescription]);
  const valid = [
    form.company.trim().length >= 2 && form.description.trim().length >= 20,
    !!form.department && form.volume.trim().length >= 2,
    form.success.trim().length >= 10,
    true,
  ][step];
  async function next() {
    if (!valid) return;
    if (step < 3) {
      setStep(step + 1);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/v1/business-audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message);
      router.push(`/plans?id=${data.id}${flowId ? `&flow=${flowId}` : ""}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
      setBusy(false);
    }
  }
  return (
    <div className={s.page}>
      <header className={s.head}>
        <div>
          <span className={s.eyebrow}>Audit guidé · environ cinq minutes</span>
          <h1>Parlons de votre entreprise.</h1>
          {seats && (
            <p>
              Configuration Business : {seats} sièges. Ce choix sera conservé
              dans votre audit.
            </p>
          )}
          <p>
            Pas besoin de connaître les agents ou les automatisations. Décrivez
            le travail : nous préparons votre plan à partir de vos réponses.
          </p>
        </div>
        <Link href="/plans" className={s.secondary}>
          Mes dossiers
        </Link>
      </header>
      <div className={s.split}>
        <section className={s.paper}>
          {intakeNotice && (
            <p className={s.note} role="status">
              {intakeNotice}
              {website?.startsWith("https://") && (
                <>
                  {" "}
                  <a href={website} target="_blank" rel="noreferrer">
                    Page source
                  </a>
                </>
              )}
            </p>
          )}
          <p>Étape {step + 1} sur 4</p>
          <div className={s.progress}>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} data-active={i <= step} />
            ))}
          </div>
          <div className={s.bubble}>
            {
              [
                "D’abord, que fait votre entreprise et pour qui ?",
                "Où votre équipe perd-elle du temps aujourd’hui ?",
                "Quel résultat vous ferait dire : c’est vraiment utile ?",
                "Quels outils gardons-nous, et quelles limites posons-nous ?",
              ][step]
            }
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void next();
            }}
          >
            {step === 0 && (
              <>
                <label>
                  Vous accompagnez
                  <select
                    value={form.audience}
                    onChange={(e) =>
                      update(
                        "audience",
                        e.target.value as AuditInput["audience"],
                      )
                    }
                  >
                    <option value="company">Mon entreprise</option>
                    <option value="integrator">
                      Un client, en tant qu’intégrateur
                    </option>
                  </select>
                </label>
                <label>
                  Nom de l’entreprise
                  <input
                    value={form.company}
                    onChange={(e) => update("company", e.target.value)}
                    maxLength={120}
                    autoComplete="organization"
                  />
                </label>
                <label>
                  Activité, clients et offre
                  <textarea
                    value={form.description}
                    onChange={(e) => update("description", e.target.value)}
                    maxLength={4000}
                    placeholder="Nous sommes un bureau d’études de 12 personnes. Nous répondons à…"
                  />
                </label>
              </>
            )}
            {step === 1 && (
              <>
                <label>
                  Votre priorité
                  <select
                    value={form.department}
                    onChange={(e) => update("department", e.target.value)}
                  >
                    {departments.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Quel travail, à quelle fréquence ?
                  <textarea
                    value={form.volume}
                    onChange={(e) => update("volume", e.target.value)}
                    maxLength={400}
                    placeholder="Une vingtaine de demandes de devis chaque semaine, environ 30 minutes chacune."
                  />
                </label>
              </>
            )}
            {step === 2 && (
              <>
                <label>
                  Résultat concret et critères de réussite
                  <textarea
                    value={form.success}
                    onChange={(e) => update("success", e.target.value)}
                    maxLength={1200}
                    placeholder="Un devis préparé à partir de notre catalogue, avec les points manquants à demander au client."
                  />
                </label>
                <label>
                  Ce que l’agent ne doit jamais faire
                  <textarea
                    value={form.constraints}
                    onChange={(e) => update("constraints", e.target.value)}
                    maxLength={2000}
                    placeholder="Ne jamais confirmer un prix sans notre grille ni envoyer le devis sans validation."
                  />
                </label>
              </>
            )}
            {step === 3 && (
              <>
                <label>
                  Vos outils actuels
                  <textarea
                    value={form.tools}
                    onChange={(e) => update("tools", e.target.value)}
                    maxLength={1000}
                    placeholder="HubSpot, Google Drive, Outlook, Claude…"
                  />
                </label>
                <label>
                  Budget mensuel cible, en euros
                  <input
                    type="number"
                    min={0}
                    max={100000}
                    value={form.budget}
                    onChange={(e) => update("budget", Number(e.target.value))}
                  />
                </label>
                <p className={s.note}>
                  Ce montant est une préférence de cadrage, pas une réservation
                  ni un abonnement. Aucun achat ne sera effectué.
                </p>
              </>
            )}
            {error && (
              <p className={s.error} role="alert">
                {error}
              </p>
            )}
            <div className={s.actions}>
              <button
                type="button"
                className={s.secondary}
                onClick={() => setStep(Math.max(0, step - 1))}
                disabled={step === 0 || busy}
              >
                Retour
              </button>
              <button className={s.primary} disabled={!valid || busy}>
                {busy
                  ? "Préparation du plan…"
                  : step === 3
                    ? "Préparer mon plan"
                    : "Continuer"}
              </button>
            </div>
          </form>
        </section>
        <aside className={`${s.paper} ${s.summary}`}>
          <h2>Votre entreprise prend forme.</h2>
          <dl>
            <dt>Entreprise</dt>
            <dd>{form.company || "À découvrir ensemble"}</dd>
            <dt>Priorité</dt>
            <dd>{form.department}</dd>
            <dt>Résultat attendu</dt>
            <dd>{form.success || "À préciser dans la conversation"}</dd>
            <dt>Outils existants</dt>
            <dd>{form.tools || "Nous les définirons ensemble"}</dd>
          </dl>
          <p className={s.note}>
            Les recommandations sont fondées sur vos réponses, pas sur une
            analyse automatique de vos comptes. Ne saisissez pas de mot de passe
            ou de secret.
          </p>
        </aside>
      </div>
    </div>
  );
}
