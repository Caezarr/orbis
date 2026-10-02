import { SubscriptionPlans } from "@/components/billing/SubscriptionPlans";
import s from "@/components/billing/billing.module.css";

export const metadata = { title: "Abonnement — Orbis" };

export default function Page() {
  return (
    <div className={s.page}>
      <h1>Abonnement</h1>
      <p className={s.lead}>
        Un essai gratuit, puis une formule simple. Le modèle d’IA est fourni par Orbis ; chaque formule inclut un nombre de brouillons par mois et un
        plafond de coût qui protège votre espace.
      </p>
      <SubscriptionPlans />
    </div>
  );
}
