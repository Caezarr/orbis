"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { flows, departments, capabilityLabels } from "@/lib/product/catalog";
import { businessWorkflows } from "@/lib/workflows/blueprints";
import s from "./product.module.css";
export function Catalog() {
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(12);
  const [department, setDepartment] = useState("");
  const [industry, setIndustry] = useState("");
  const items = flows.filter(
    (f) =>
      (!department || f.department === department) &&
      (!industry || f.industry === industry) &&
      `${f.title} ${f.input} ${f.output} ${f.industry}`
        .toLocaleLowerCase("fr")
        .includes(q.toLocaleLowerCase("fr")),
  );
  return (
    <div className={s.page}>
      <header className={s.head}>
        <div>
          <h1>Marketplace</h1>
          <p>
            100 cas métier préconçus. Choisissez un résultat, adaptez les règles
            à votre entreprise et préparez un premier livrable à valider.
          </p>
        </div>
        <Link href="/chat" className={s.primary}>
          Describe what you need <ArrowRight size={16} />
        </Link>
      </header>
      <section className="mb-10">
        <h2 className="mb-4 text-xl font-medium">
          Business systems, not isolated tasks
        </h2>
        <div className={s.grid}>
          {businessWorkflows.map((w) => (
            <article key={w.id} className={s.card}>
              <small>{w.audience}</small>
              <h2>{w.name}</h2>
              <p>{w.outcome}</p>
              <Link href={`/workflows/${w.id}`}>
                Explore the workflow <ArrowRight className="inline" size={16} />
              </Link>
            </article>
          ))}
        </div>
      </section>
      <h2 className="mb-4 text-xl font-medium">Mission library</h2>
      <div className={s.filters}>
        <label className="sr-only" htmlFor="catalog-search">
          Rechercher un cas
        </label>
        <input
          id="catalog-search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setLimit(12);
          }}
          placeholder="Rechercher : devis, recrutement, chantier…"
        />
        <select
          aria-label="Filtrer par département"
          value={department}
          onChange={(e) => {
            setDepartment(e.target.value);
            setLimit(12);
          }}
        >
          <option value="">Tous les départements</option>
          {departments.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        <select
          aria-label="Filtrer par secteur"
          value={industry}
          onChange={(e) => {
            setIndustry(e.target.value);
            setLimit(12);
          }}
        >
          <option value="">Tous les secteurs</option>
          {[...new Set(flows.map((f) => f.industry))].map((i) => (
            <option key={i}>{i}</option>
          ))}
        </select>
      </div>
      <p className={s.count} role="status">
        {items.length} missions
      </p>
      <div className={s.grid}>
        {items.slice(0, limit).map((f) => (
          <article className={s.card} key={f.id}>
            <small>
              {f.department} / {f.industry}
            </small>
            <h2>{f.title}</h2>
            <p>{f.output}</p>
            <div className={s.tags}>
              {f.capabilities.map((c) => (
                <span key={c}>{capabilityLabels[c]}</span>
              ))}
            </div>
            <p>
              <strong>À préparer :</strong> {f.input}
            </p>
            <Link href={`/catalog/${f.id}`}>
              Voir le déroulement <ArrowRight className="inline" size={13} />
            </Link>
          </article>
        ))}
      </div>
      {items.length > limit && (
        <div className={s.actions}>
          <span className={s.count}>
            {limit} sur {items.length} cas affichés
          </span>
          <button
            className={s.secondary}
            onClick={() => setLimit((n) => n + 12)}
          >
            Afficher 12 autres cas
          </button>
        </div>
      )}
      {!items.length && (
        <div className={s.empty}>
          <Search className="mx-auto" />
          <h2>Aucun cas pour ces filtres.</h2>
          <button
            className={s.secondary}
            onClick={() => {
              setQ("");
              setDepartment("");
              setIndustry("");
            }}
          >
            Réinitialiser les filtres
          </button>
        </div>
      )}
    </div>
  );
}
