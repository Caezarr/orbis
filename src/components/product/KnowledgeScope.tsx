"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { KnowledgeSelection } from "@/lib/product/knowledge-scopes";
import s from "./product.module.css";
const choices = {
  sharepoint: ["site", "subsite", "library", "folder", "file"],
  notion: ["page", "database"],
  drive: ["folder", "file"],
};
const labels: Record<string, string> = {
  site: "Site",
  subsite: "Sous-site",
  library: "Bibliothèque",
  folder: "Dossier",
  file: "Fichier",
  page: "Page",
  database: "Base de données",
};
export function KnowledgeScope({ missionId }: { missionId: string }) {
  const [provider, setProvider] = useState<"sharepoint" | "notion" | "drive">(
    "sharepoint",
  );
  const [kind, setKind] = useState("folder"),
    [url, setUrl] = useState(""),
    [instructions, setInstructions] = useState("");
  const [recursive, setRecursive] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [items, setItems] = useState<KnowledgeSelection[]>([]);
  useEffect(() => {
    let live = true;
    fetch(`/api/v1/knowledge-scopes?mission=${encodeURIComponent(missionId)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Chargement impossible.");
        return r.json();
      })
      .then((d) => {
        if (live) setItems(d.items);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [missionId]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/v1/knowledge-scopes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          missionId,
          provider,
          kind,
          url,
          recursive: kind !== "file" && recursive,
          instructions,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      setItems((old) => [...old.filter((i) => i.id !== d.id), d]);
      setUrl("");
      setInstructions("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={s.page}>
      <header className={s.head}>
        <div>
          <span className={s.eyebrow}>Connaissances de la mission</span>
          <h1>Le bon contexte. Rien de plus.</h1>
          <p>
            Choisissez où l’agent devra chercher. Vos documents restent dans vos
            outils ; aucun accès global n’est demandé ici.
          </p>
        </div>
        <Link
          className={s.secondary}
          href={`/missions/${encodeURIComponent(missionId)}/setup`}
        >
          Retour à la mission
        </Link>
      </header>
      <div className={s.split}>
        <section className={s.paper}>
          <h2>Ajouter un périmètre</h2>
          <form onSubmit={save}>
            <label>
              Où sont vos connaissances ?
              <select
                value={provider}
                onChange={(e) => {
                  const p = e.target.value as typeof provider;
                  setProvider(p);
                  setKind(choices[p][0]);
                  setUrl("");
                }}
              >
                <option value="sharepoint">Microsoft SharePoint</option>
                <option value="notion">Notion</option>
                <option value="drive">Google Drive</option>
              </select>
            </label>
            <label>
              Type de ressource
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                {choices[provider].map((k) => (
                  <option key={k} value={k}>
                    {labels[k]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Lien précis
              <input
                required
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                maxLength={2000}
                placeholder={
                  provider === "sharepoint"
                    ? "https://entreprise.sharepoint.com/sites/Commercial/Documents"
                    : provider === "notion"
                      ? "https://www.notion.so/votre-page"
                      : "https://drive.google.com/drive/folders/…"
                }
              />
            </label>
            {kind !== "file" && (
              <label>
                <input
                  type="checkbox"
                  checked={recursive}
                  onChange={(e) => setRecursive(e.target.checked)}
                />{" "}
                Inclure les sous-ressources autorisées
              </label>
            )}
            <label>
              Comment utiliser ces documents ?
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                maxLength={2000}
                placeholder="Utiliser uniquement les tarifs validés. Demander confirmation si deux documents se contredisent."
              />
            </label>
            {error && (
              <p role="alert" className={s.error}>
                {error}
              </p>
            )}
            <button disabled={busy} className={s.primary}>
              {busy ? "Enregistrement…" : "Enregistrer ce périmètre"}
            </button>
          </form>
        </section>
        <section className={s.paper}>
          <h2>Ce que l’agent pourra consulter</h2>
          <p className={s.note}>
            Ces sélections sont enregistrées, mais pas encore consultables par
            l’agent. La connexion OAuth, la vérification des droits et la
            synchronisation devront réussir avant leur utilisation.
          </p>
          {!items.length && (
            <p>
              Aucun périmètre sélectionné. Ajoutez uniquement les ressources
              utiles à cette mission.
            </p>
          )}
          <div aria-live="polite">
            {items.map((item) => (
              <article
                key={item.id}
                style={{
                  padding: "20px 0",
                  borderBottom: "1px solid #e4e8ef",
                  overflowWrap: "anywhere",
                }}
              >
                <strong>
                  {item.provider} · {labels[item.kind]}
                </strong>
                <p>{item.url}</p>
                <p>
                  {item.recursive
                    ? "Sous-ressources incluses sous réserve des droits"
                    : "Ressource sélectionnée uniquement"}
                </p>
                <small>En attente de connexion · lecture seule</small>
              </article>
            ))}
          </div>
          <Link href="/connections" className={s.secondary}>
            Gérer les outils et accès
          </Link>
        </section>
      </div>
    </div>
  );
}
