"use client";

import { useId, useState } from "react";
import {
  planQuote,
  proposedPlans,
  proposedRateCard,
  type PlanConfig,
  type RateCard,
} from "@/lib/billing/rates";
import styles from "./task-pricing.module.css";

export type TaskPricingProps = {
  plans?: PlanConfig;
  rateCard?: RateCard;
  initialSeats?: number;
  onSelectPlan?: (selection: {
    plan: "Solo" | "Business" | "Partner";
    seats: number | null;
  }) => void;
};
const euro = (cents: number) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(cents / 100);

export function TaskPricing({
  plans = proposedPlans,
  rateCard = proposedRateCard,
  initialSeats = 5,
  onSelectPlan,
}: TaskPricingProps) {
  const id = useId();
  const [seats, setSeats] = useState(() =>
    Number.isSafeInteger(initialSeats)
      ? Math.max(1, Math.min(plans.maxSeats, initialSeats))
      : 5,
  );
  const business = planQuote(
    "Business",
    Math.min(seats, plans.maxSeats),
    plans,
  );
  const solo = planQuote("Solo", 1, plans);
  return (
    <section className={styles.pricing} aria-labelledby={`${id}-title`}>
      <header>
        <span className={styles.eyebrow}>Une tâche, un résultat</span>
        <h2 id={`${id}-title`}>Un budget clair pour le travail accompli.</h2>
        <p>
          Tarifs proposés, configurables et à valider avant commercialisation.
          Une tâche incluse correspond à un résultat métier terminé, quelle que
          soit sa verticale.
        </p>
      </header>
      <div className={styles.cards}>
        {[solo, business].map((plan) => (
          <article
            key={plan.plan}
            className={plan.plan === "Business" ? styles.featured : styles.card}
          >
            <h3>{plan.plan}</h3>
            <p>
              {plan.plan === "Solo"
                ? "Pour vos premières missions."
                : "Pour les équipes qui travaillent ensemble."}
            </p>
            {plan.plan === "Business" && (
              <label className={styles.seats} htmlFor={`${id}-seats`}>
                Nombre de sièges
                <select
                  id={`${id}-seats`}
                  value={business.seats}
                  onChange={(event) => setSeats(Number(event.target.value))}
                >
                  {Array.from({ length: plans.maxSeats }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className={styles.price} aria-live="polite">
              {euro(plan.monthlyCents)} <small>HT / mois</small>
            </div>
            <ul>
              <li>
                {plan.includedTasks} tâches incluses par mois, partagées entre
                les sièges
              </li>
              <li>
                Budget supplémentaire suggéré :{" "}
                {euro(plan.suggestedBudgetCents)} / mois
              </li>
              <li>Échecs et annulations non facturés</li>
            </ul>
            <p className={styles.note}>
              Le budget est un plafond à définir, pas une somme prélevée. Les
              tâches supplémentaires suivent le barème ci-dessous.
            </p>
            {onSelectPlan && (
              <button
                type="button"
                onClick={() =>
                  onSelectPlan({ plan: plan.plan, seats: plan.seats })
                }
              >
                Choisir {plan.plan}
              </button>
            )}
          </article>
        ))}
        <article className={styles.card}>
          <h3>Partner</h3>
          <p>Pour déployer chez plusieurs clients.</p>
          <div className={styles.price}>Sur devis</div>
          <ul>
            <li>Sièges et tâches incluses définis au contrat</li>
            <li>Budgets distincts par client</li>
            <li>Conditions de volume personnalisées</li>
          </ul>
          {onSelectPlan && (
            <button
              type="button"
              onClick={() => onSelectPlan({ plan: "Partner", seats: null })}
            >
              Discuter du plan Partner
            </button>
          )}
        </article>
      </div>
      <details className={styles.rates}>
        <summary>Barème proposé par tâche terminée</summary>
        <div className={styles.tableWrap}>
          <table>
            <caption>
              Hors tâches incluses · EUR HT · {rateCard.version}
            </caption>
            <thead>
              <tr>
                <th scope="col">Verticale</th>
                <th scope="col">Par tâche</th>
              </tr>
            </thead>
            <tbody>
              {rateCard.tasks.map((rate) => (
                <tr key={rate.id}>
                  <th scope="row">{rate.label}</th>
                  <td>{euro(rate.taskCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3>Production média en supplément</h3>
        <ul>
          {rateCard.media.map((rate) => (
            <li key={rate.id}>
              {rate.label} : {euro(rate.unitCents)} par unité
            </li>
          ))}
        </ul>
        <p>
          Quantité et prix présentés avant acceptation. Les médias ne consomment
          pas les tâches incluses. Les nouvelles tentatives pour le même
          résultat ne créent pas une nouvelle facture. Un statut incertain
          conserve la réservation jusqu’à résolution.
        </p>
      </details>
    </section>
  );
}
export default TaskPricing;
