"use client";
import Link from "next/link";
import { SubscriptionPlans } from "@/components/billing/SubscriptionPlans";

/** Settings → Billing: same plans section as /billing (V1 subscription + trial). */
export function BillingSettings() {
  return (
    <section aria-label="Abonnement">
      <p>
        <Link href="/billing">Ouvrir la page Abonnement</Link>
      </p>
      <SubscriptionPlans />
    </section>
  );
}
