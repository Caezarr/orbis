"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { flows, departments, capabilityLabels } from "@/lib/product/catalog";
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
          <span className={s.eyebrow}>Le travail que vous pouvez déléguer</span>
          <h1>
            Votre prochaine équipe
            <br />
            commence par un besoin.
          </h1>
          <p>
            100 cas métier préconçus. Choisissez un résultat, adaptez les règles
            à votre entreprise et préparez un premier livrable à valider.
          </p>
        </div>
        <Link href="/audit" className={s.primary}>
          Trouver mes cas prioritaires <ArrowRight size={16} />
        </Link>
      </header>
      <div className={s.banner}>
        <div>
          <h2>Vous connaissez votre métier. Partons de là.</h2>
          <p>
            Un audit guidé pour définir vos priorités, vos outils et ce qu’un
            bon résultat signifie pour vous.
          </p>
        </div>
        <Link className={s.secondary} href="/audit?audience=integrator">
          J’accompagne des clients
        </Link>
      </div>
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
        {items.length} cas · livrables documentaires disponibles avec un
        fournisseur IA configuré. Connexions et actions externes à qualifier
        séparément.
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
