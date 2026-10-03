import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { inboxMode } from "@/lib/inbox/service";
import { demoMailboxActive, isProductionRuntime } from "@/lib/integrations/demo-mailbox/guard";
import { demoStore, type DemoMessage } from "@/lib/integrations/demo-mailbox/store";
import { SimulatedDrafts } from "./SimulatedDrafts";
import s from "./demo.module.css";

export const metadata: Metadata = {
  title: "Boîte mail démo · Orbis",
  robots: { index: false, follow: false },
};

const when = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

/**
 * Local development only (404 in production or without ORBIS_DEMO_MAILBOX):
 * the fake mailbox as a human would see it, and every draft Orbis wrote into it.
 */
export default async function DemoMailboxPage() {
  if (isProductionRuntime()) notFound();
  await connection();
  if (!demoMailboxActive()) notFound();
  const state = demoStore().read();
  const byThread = new Map<string, DemoMessage[]>();
  for (const m of state.messages) byThread.set(m.threadKey, [...(byThread.get(m.threadKey) ?? []), m]);
  const inbox = state.messages.filter((m) => m.direction === "in").sort((a, b) => b.at.localeCompare(a.at));
  const sent = state.messages.filter((m) => m.direction === "out").length;
  const drafts = [...state.drafts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const mode = inboxMode();
  return (
    <main className={s.page}>
      <p className={s.banner}>
        Boîte mail de démonstration ({state.company.name}, données fictives). Rien n’est jamais envoyé. Réinitialiser :{" "}
        <code className={s.code}>pnpm demo:reset</code>
      </p>
      <h1 className={s.title}>{state.owner.email}</h1>
      <p className={s.muted}>
        {inbox.length} reçus · {sent} envoyés · {drafts.length} brouillon{drafts.length > 1 ? "s" : ""} créé
        {drafts.length > 1 ? "s" : ""} par Orbis · remplie le {when(state.seededAt)} · comptes connectés :{" "}
        {state.accounts.filter((a) => a.status === "ACTIVE").map((a) => a.provider).join(", ") || "aucun"} · mode
        Orbis : <strong>{mode}</strong>
        {mode === "test" && " (brouillons simulés, non écrits ici : voir plus bas)"}
      </p>
      <div className={s.grid}>
        <section className={s.panel} aria-labelledby="drafts">
          <h2 id="drafts">Brouillons écrits par Orbis dans la boîte</h2>
          {drafts.length === 0 ? (
            <p className={s.empty}>
              Aucun brouillon pour l’instant.
              {mode === "test" &&
                " En mode test, Orbis ne touche pas la boîte : passez ORBIS_INBOX_MODE=scoped_autonomy pour les voir arriver ici."}
            </p>
          ) : (
            <ul className={s.list}>
              {drafts.map((d) => {
                const original = (byThread.get(d.threadKey) ?? []).filter((m) => m.direction === "in").at(-1);
                return (
                  <li key={d.id} className={s.item}>
                    <div className={s.row}>
                      <span className={s.from}>
                        <span className={s.badge}>{d.provider}</span>À : {d.to.join(", ")}
                      </span>
                      <span className={s.date}>{when(d.createdAt)}</span>
                    </div>
                    <div className={s.subject}>{d.subject}</div>
                    <div className={s.body}>{d.body}</div>
                    {original && (
                      <details>
                        <summary className={s.note}>Message d’origine de {original.from.name}</summary>
                        <div className={s.body}>{original.text}</div>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <SimulatedDrafts />
        </section>
        <section className={s.panel} aria-labelledby="inbox">
          <h2 id="inbox">Boîte de réception</h2>
          <ul className={s.list}>
            {inbox.map((m) => (
              <li key={m.key} className={s.item}>
                <details>
                  <summary>
                    <span className={s.row}>
                      <span className={s.from}>{m.from.name}</span>
                      <span className={s.date}>{when(m.at)}</span>
                    </span>
                    <span className={s.subject}>{m.subject}</span>
                  </summary>
                  <div className={s.note}>
                    {m.from.email}
                    {m.replyTo ? ` · Reply-To : ${m.replyTo}` : ""}
                  </div>
                  {(byThread.get(m.threadKey) ?? []).map((t) => (
                    <div key={t.key} className={s.body}>
                      <div className={s.note}>
                        {t.direction === "out" ? "Envoyé" : "Reçu"} · {when(t.at)}
                      </div>
                      {t.text}
                    </div>
                  ))}
                </details>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
