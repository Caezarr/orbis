import Link from "next/link";
import { notFound } from "next/navigation";
import { findFlow, capabilityLabels } from "@/lib/product/catalog";
import s from "@/components/product/product.module.css";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const flow = findFlow(id);
  if (!flow) notFound();
  return (
    <div className={s.page}>
      <Link href="/catalog" className={s.back}>
        ← Catalogue
      </Link>
      <header className={s.head}>
        <div>
          <span className={s.eyebrow}>
            {flow.department} · Contrat v{flow.version}
          </span>
          <h1>{flow.title}</h1>
          <p>{flow.output}</p>
        </div>
        <Link className={s.primary} href={`/audit?flow=${flow.id}`}>
          Adapter à mon entreprise
        </Link>
      </header>
      <div className={s.split}>
        <section className={s.paper}>
          <h2>Un résultat, une méthode claire.</h2>
          <ol className={s.steps}>
            {flow.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <h2 className="mt-8!">Ce qui fait un bon résultat</h2>
          <p>{flow.acceptance}</p>
          <h2 className="mt-8!">Ce que l’agent peut apprendre</h2>
          <p>{flow.memory}</p>
        </section>
        <aside className={s.paper}>
          <h2>Avant de commencer</h2>
          <p>{flow.input}</p>
          <div className={s.tags}>
            {flow.capabilities.map((c) => (
              <span key={c}>{capabilityLabels[c]}</span>
            ))}
          </div>
          <p className={s.note}>
            La préparation documentaire utilise votre fournisseur IA et vos
            sources. Les autres outils décrivent les extensions du flow ; ils ne
            sont pas encore connectés automatiquement.
          </p>
          <h2>Vous gardez la décision</h2>
          <p>
            {flow.approval}. Aucun envoi, paiement ou changement dans vos outils
            n’est déclenché ici.
          </p>
          <Link className={`${s.primary} mt-6`} href={`/audit?flow=${flow.id}`}>
            Configurer ce cas
          </Link>
        </aside>
      </div>
    </div>
  );
}
