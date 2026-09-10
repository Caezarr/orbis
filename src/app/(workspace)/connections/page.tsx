"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import s from "@/components/product/product.module.css";
export default function Page() {
  const [runtime, setRuntime] = useState<{
    configured: boolean;
    provider: string;
    model: string;
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/v1/runtime")
      .then(async (r) => {
        if (!r.ok) throw new Error("Impossible de vérifier le fournisseur.");
        return r.json();
      })
      .then(setRuntime)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <div className={s.page}>
      <header className={s.head}>
        <div>
          <span className={s.eyebrow}>Outils & accès</span>
          <h1>Vos outils gardent leur place.</h1>
          <p>
            Vos comptes, des services fournis par Orbis, ou les deux. Chaque
            mission conserve ses préférences séparément des accès réellement
            disponibles.
          </p>
        </div>
        <Link href="/plans" className={s.primary}>
          Choisir mes outils par mission
        </Link>
      </header>
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
      <div className={s.split}>
        <section className={s.paper}>
          <h2>Votre fournisseur IA</h2>
          <p>
            {runtime
              ? runtime.configured
                ? `${runtime.provider} / ${runtime.model} — configuration serveur détectée, appel à valider`
                : "Aucun fournisseur configuré"
              : "Vérification…"}
          </p>
          <p className={s.note}>
            La clé reste côté serveur. Les sources sélectionnées et les
            instructions sont envoyées au fournisseur lors d’un run. La présence
            d’une clé ne confirme ni sa validité ni son quota.
          </p>
          <details>
            <summary className="cursor-pointer">
              Instructions pour l’administrateur
            </summary>
            <p className="mt-4">
              Configurer ORBIS_AI_PROVIDER, ORBIS_AI_MODEL et OPENAI_API_KEY ou
              ANTHROPIC_API_KEY dans l’environnement serveur, puis redémarrer.
              Ne saisissez jamais une clé dans un document de connaissance.
            </p>
          </details>
        </section>
        <section className={s.paper}>
          <h2>Outils métier et fourniture gérée</h2>
          <p>
            CRM, enrichissement, comptabilité, RH et publication : les
            dépendances sont définies dans chaque plan. Les adaptateurs OAuth et
            les offres gérées ne sont pas encore activés sur cette installation.
          </p>
          <p className={s.note}>
            Aucun outil n’est présenté comme connecté sur la seule base d’une
            sélection. L’accès, le périmètre autorisé et les coûts doivent être
            validés avant toute action.
          </p>
          <Link href="/plans" className={s.secondary}>
            Retrouver mes plans
          </Link>
        </section>
      </div>
    </div>
  );
}
