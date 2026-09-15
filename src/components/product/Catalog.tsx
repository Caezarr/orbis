"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { flows, departments, capabilityLabels } from "@/lib/product/catalog";
import { businessWorkflows } from "@/lib/workflows/blueprints";
import s from "./product.module.css";
import v from "./mission-flow.module.css";
export function Catalog() {
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(12);
  const [department, setDepartment] = useState("");
  const [industry, setIndustry] = useState("");
  const [vertical, setVertical] = useState("");
  const [workflowQuery, setWorkflowQuery] = useState("");
  const workflows = businessWorkflows.filter(
    (w) =>
      (!vertical || w.id === vertical) &&
      [
        w.name,
        w.vertical,
        w.audience,
        w.outcome,
        ...(w.tasks?.flatMap((task) => [
          task.name,
          task.outcome,
          task.input,
          ...(task.tools ?? []),
        ]) ?? []),
      ]
        .join(" ")
        .toLowerCase()
        .includes(workflowQuery.trim().toLowerCase()),
  );
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
            {businessWorkflows.length} business verticals. Choose a result,
            define a task budget and connect the tools your team already uses.
          </p>
        </div>
        <Link href="/chat" className={s.primary}>
          Describe what you need <ArrowRight size={16} />
        </Link>
      </header>
      <section className="mb-10">
        <h2 className="mb-4 text-xl font-medium">
          What would you like taken care of?
        </h2>
        <div className={v.catalogFilters}>
          <label>
            Find an outcome
            <input
              value={workflowQuery}
              onChange={(e) => setWorkflowQuery(e.target.value)}
              placeholder="Try invoice, interview, Shopify…"
            />
          </label>
          <label>
            Business vertical
            <select
              value={vertical}
              onChange={(e) => setVertical(e.target.value)}
            >
              <option value="">All verticals</option>
              {businessWorkflows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.vertical ?? w.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className={s.count} role="status">
          {workflows.length} verticals ·{" "}
          {workflows.reduce((sum, w) => sum + (w.tasks?.length ?? 0), 0)} scoped
          tasks
        </p>
        <div className={s.grid}>
          {workflows.map((w) => (
            <article key={w.id} className={s.card}>
              <small>
                {w.vertical} / {w.tasks?.length ?? 0} task types
              </small>
              <h2>{w.name}</h2>
              <p>{w.outcome === w.name ? w.audience : w.outcome}</p>
              <ul className={v.catalogTasks}>
                {w.tasks?.map((task) => (
                  <li key={task.id}>
                    <span>{task.name}</span>
                    <small>Per {task.unit ?? "task"}</small>
                  </li>
                ))}
              </ul>
              <Link href={`/workflows/${w.id}`}>
                Explore the workflow <ArrowRight className="inline" size={16} />
              </Link>
            </article>
          ))}
        </div>
        {!workflows.length && (
          <div className={s.empty}>
            <h3>No matching workflow</h3>
            <p>Try a different outcome or vertical.</p>
            <button
              className={s.secondary}
              onClick={() => {
                setVertical("");
                setWorkflowQuery("");
              }}
            >
              Reset workflow filters
            </button>
          </div>
        )}
        <p className={v.pricingNote}>
          Each task has a bounded deliverable and acceptance criteria. Pricing
          and usage caps are confirmed during setup. Blueprints describe
          intended work; they do not indicate live connections or running
          missions.
        </p>
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
