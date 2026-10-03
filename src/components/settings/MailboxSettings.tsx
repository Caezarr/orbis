"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ContinuousToggle } from "@/app/start/ContinuousToggle";
import type { MailboxStatus } from "@/lib/start/flow";
import type { StartReadiness } from "@/lib/start/server";
import s from "./settings.module.css";

type Provider = "gmail" | "outlook";
const NAMES: Record<Provider, string> = { outlook: "Outlook", gmail: "Gmail" };
type Row = { provider: Provider; status: MailboxStatus | "forbidden" };

const STATUS: Record<Row["status"], { label: string; tone: "ok" | "warn" | "muted" }> = {
  connected: { label: "Connectée", tone: "ok" },
  not_connected: { label: "Non connectée", tone: "muted" },
  not_configured: { label: "Pas disponible sur ce déploiement", tone: "muted" },
  checking: { label: "Vérification…", tone: "muted" },
  unknown: { label: "Vérification…", tone: "muted" },
  error: { label: "Vérification impossible pour l’instant", tone: "warn" },
  forbidden: { label: "Vérification réservée au propriétaire, aux administrateurs et aux opérateurs", tone: "muted" },
};

/**
 * Réglages › Boîte mail: which mailbox is connected (server-side check, same
 * route as /start), what Orbi may do with it, and continuous drafting.
 * Connecting goes through /start (one consent flow, one place).
 */
export function MailboxSettings() {
  const [readiness, setReadiness] = useState<StartReadiness | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const r = await fetch("/api/v1/start", { cache: "no-store" });
        if (!r.ok) throw new Error();
        const ready = (await r.json()) as StartReadiness;
        if (!live) return;
        setReadiness(ready);
        const providers = (Object.keys(NAMES) as Provider[]).filter((p) => ready.providers[p]?.configured);
        setRows(providers.map((provider) => ({ provider, status: "checking" })));
        for (const provider of providers) {
          const v = await fetch("/api/v1/start/mailbox", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider, action: "verify" }),
          }).catch(() => null);
          const status: Row["status"] =
            v?.status === 403 ? "forbidden" : v?.ok ? ((await v.json()) as { status: MailboxStatus }).status : "error";
          if (live) setRows((all) => all.map((row) => (row.provider === provider ? { provider, status } : row)));
        }
      } catch {
        if (live) setFailed(true);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  if (failed)
    return (
      <p className={s.alert} role="alert">
        Impossible de vérifier votre boîte mail pour l’instant. Rechargez la page.
      </p>
    );
  if (!readiness) return <p className={s.fine}>Vérification de votre boîte mail…</p>;

  if (!readiness.inbox.enabled || !rows.length)
    return (
      <div className={s.card}>
        <p>
          Les brouillons de réponse ne sont pas encore activés sur ce déploiement. Aucune boîte mail ne peut être
          connectée pour l’instant.
        </p>
      </div>
    );

  const connected = rows.filter((r) => r.status === "connected");
  return (
    <div className={s.stack}>
      <ul className={s.list}>
        {rows.map((row) => (
          <li key={row.provider} className={s.row}>
            <strong>{NAMES[row.provider]}</strong>
            <span className={s[STATUS[row.status].tone]}>{STATUS[row.status].label}</span>
          </li>
        ))}
      </ul>
      <p className={s.fine}>
        Orbi lit vos demandes entrantes et vos réponses envoyées, et dépose des brouillons dans la conversation. Il ne
        peut ni envoyer, ni supprimer, ni déplacer un mail.
        {readiness.inbox.mode !== "scoped_autonomy" &&
          " Mode test sur ce déploiement : les brouillons sont simulés, rien n’est écrit dans votre boîte."}
      </p>
      {connected.length === 0 && (
        <div>
          <Link href="/start" className={s.primary}>
            Connecter Outlook ou Gmail
          </Link>
        </div>
      )}
      <ContinuousToggle />
    </div>
  );
}
