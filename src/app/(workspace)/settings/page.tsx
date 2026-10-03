import Link from "next/link";
import { AccountData } from "@/components/account/AccountData";
import { PlanBanner } from "@/components/billing/PlanBanner";
import { TeamSettings } from "@/components/product/TeamSettings";
import { DigestToggle } from "@/components/settings/DigestToggle";
import { MailboxSettings } from "@/components/settings/MailboxSettings";
import { getRequestStore } from "@/lib/platform/request";
import { frozenSurfacesEnabled } from "@/lib/product/surfaces";
import s from "@/components/settings/settings.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Réglages · Orbis" };

const SECTIONS = [
  ["boite", "Boîte mail"],
  ["resume", "Résumé quotidien"],
  ["abonnement", "Abonnement"],
  ["equipe", "Équipe"],
  ["compte", "Vos données"],
] as const;

export default async function Page() {
  // memberships = the signed-in user's own membership of this workspace (RLS).
  // Not wrapped in try/catch: getRequestStore redirects to /login when signed out.
  const role = (await getRequestStore()).memberships[0]?.role ?? null;
  return (
    <div className={s.page}>
      <header className={s.head}>
        <h1>Réglages</h1>
        <p>Votre boîte connectée, le résumé du matin, l’abonnement, l’équipe et vos données.</p>
        <nav className={s.jump} aria-label="Sections des réglages">
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`}>
              {label}
            </a>
          ))}
        </nav>
      </header>

      <section id="boite" className={s.section} aria-labelledby="boite-title">
        <h2 id="boite-title">Boîte mail</h2>
        <MailboxSettings />
      </section>

      <section id="resume" className={s.section} aria-labelledby="resume-title">
        <h2 id="resume-title">Résumé quotidien</h2>
        <DigestToggle unavailableText="Le résumé quotidien par e-mail n’est pas activé sur ce déploiement." />
      </section>

      <section id="abonnement" className={s.section} aria-labelledby="abonnement-title">
        <h2 id="abonnement-title">Abonnement</h2>
        <PlanBanner />
        <p>Votre formule, l’essai gratuit, le nombre de brouillons inclus et vos factures.</p>
        <div>
          <Link href="/billing" className={s.primary}>
            Gérer l’abonnement
          </Link>
        </div>
      </section>

      <section id="equipe" className={s.section} aria-labelledby="equipe-title">
        <h2 id="equipe-title">Équipe</h2>
        <TeamSettings full={frozenSurfacesEnabled()} />
      </section>

      <section id="compte" className={s.section} aria-label="Vos données">
        <AccountData role={role} />
      </section>
    </div>
  );
}
