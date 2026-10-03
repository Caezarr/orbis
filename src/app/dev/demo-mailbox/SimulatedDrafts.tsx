"use client";

import { useEffect, useState } from "react";
import s from "./demo.module.css";

type Message = {
  id: string;
  subjectPreview?: string;
  draftPreview?: string;
  draft?: { simulated: boolean };
  draftedAt?: string;
};

/**
 * Test mode (ORBIS_INBOX_MODE=test) never writes to the mailbox: the broker
 * returns a simulated receipt. Those drafts only exist in Orbis, so this reads
 * them from the session's own inbox API (latest batch) to show them next to
 * the real ones.
 */
export function SimulatedDrafts() {
  const [items, setItems] = useState<Message[] | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/v1/inbox", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((body: { messages?: Message[] }) => {
        if (live) setItems((body.messages ?? []).filter((m) => m.draft?.simulated && m.draftPreview));
      })
      .catch(() => live && setItems([]));
    return () => {
      live = false;
    };
  }, []);
  if (!items?.length) return null;
  return (
    <>
      <h2 style={{ marginTop: 24 }}>Brouillons simulés (mode test, dernier passage)</h2>
      <ul className={s.list}>
        {items.map((m) => (
          <li key={m.id} className={s.item}>
            <div className={s.row}>
              <span className={s.from}>
                <span className={s.badgeSim}>simulé</span>
                {m.subjectPreview}
              </span>
              {m.draftedAt && <span className={s.date}>{new Date(m.draftedAt).toLocaleString("fr-FR")}</span>}
            </div>
            <div className={s.body}>{m.draftPreview}</div>
          </li>
        ))}
      </ul>
    </>
  );
}
