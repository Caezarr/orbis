"use client";
import { useState } from "react";
import Link from "next/link";
import { plans, estimateBill, businessMonthly } from "@/lib/product/pricing";
import s from "./product.module.css";
export function Pricing() {
  const [seats, setSeats] = useState(5);
  const [runs, setRuns] = useState(500);
  const [cost, setCost] = useState(0.1);
  const [managed, setManaged] = useState(false);
  const bill = estimateBill(149, runs, cost, managed);
  const euro = (n: number) =>
    n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
  return (
    <div className={s.page}>
      <header className={s.head}>
        <div>
          <span className={s.eyebrow}>Proposition tarifaire de lancement</span>
          <h1>
            Un abonnement clair.
            <br />
            L’usage à part.
          </h1>
          <p>
            La plateforme organise votre travail. Les fournisseurs sont facturés
            séparément selon vos choix. Grille à valider commercialement, sans
            paiement activé.
          </p>
        </div>
        <Link href="/audit" className={s.primary}>
          Cadrer mon besoin
        </Link>
      </header>
      <div className={s.grid}>
        {plans.map((p) => (
          <section key={p.name} className={s.card}>
            <small>{p.name}</small>
            <h2>{p.description}</h2>
            <p className={s.price}>
              {p.name === "Partner"
                ? "Sur discussion"
                : `${p.name === "Business" ? businessMonthly(seats) : p.monthly} €`}{" "}
              <small>{p.name !== "Partner" && "HT / mois envisagés"}</small>
            </p>
            {p.name === "Business" && (
              <label>
                Sièges (5 inclus, puis 39 € / siège envisagés)
                <select
                  value={seats}
                  onChange={(e) => setSeats(Number(e.target.value))}
                >
                  {[1, 2, 3, 5, 10, 15, 20, 30, 50].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <ul className={s.checklist}>
              {p.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <Link
              href={`/audit${p.name === "Partner" ? "?audience=integrator" : p.name === "Business" ? `?seats=${seats}` : ""}`}
            >
              {p.name === "Partner" ? "Discuss my setup" : "Préparer mon plan"}
            </Link>
          </section>
        ))}
      </div>
      <section className={`${s.paper} mt-8`}>
        <div className={s.split}>
          <div>
            <h2>Comprendre votre coût complet — Solo.</h2>
            <p>
              Simulation modifiable, pas un tarif fournisseur. Aucun crédit
              opaque, aucune promesse d’usage illimité.
            </p>
            <label>
              Runs par mois
              <input
                type="number"
                min={0}
                max={1000000}
                value={runs}
                onChange={(e) =>
                  setRuns(
                    Math.min(1000000, Math.max(0, Number(e.target.value))),
                  )
                }
              />
            </label>
            <label>
              Hypothèse de coût fournisseur par run (€)
              <input
                type="number"
                step="0.01"
                min={0}
                max={1000}
                value={cost}
                onChange={(e) =>
                  setCost(Math.min(1000, Math.max(0, Number(e.target.value))))
                }
              />
            </label>
            <label>
              Approvisionnement
              <select
                value={managed ? "managed" : "own"}
                onChange={(e) => setManaged(e.target.value === "managed")}
              >
                <option value="own">Mes propres comptes fournisseurs</option>
                <option value="managed">
                  Fourniture gérée : hypothèse +20 %
                </option>
              </select>
            </label>
          </div>
          <div className={s.summary}>
            <dl>
              <dt>Abonnement Orbis envisagé</dt>
              <dd>{euro(bill.platform)}</dd>
              <dt>Coût fournisseur estimé</dt>
              <dd>
                {euro(bill.provider)}{" "}
                {managed ? "via Orbis" : "payés directement au fournisseur"}
              </dd>
              <dt>Gestion de l’usage envisagée</dt>
              <dd>{euro(bill.managedFee)}</dd>
              <dt>Total mensuel estimé, hors intégration et taxes</dt>
              <dd className={s.price}>{euro(bill.total)}</dd>
            </dl>
            <p className={s.note}>
              Les droits de revente, les tarifs fournisseurs, les plafonds et la
              facturation devront être validés avant activation d’une offre
              gérée. L’implémentation et le support sur mesure font l’objet d’un
              devis séparé.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
