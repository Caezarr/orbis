"use client";
import { useState } from "react";
import Link from "next/link";
import { Folder, FileText, ArrowLeft, Check } from "lucide-react";
import type { Location, RemoteItem } from "@/lib/knowledge/remote";
import type { StoreState } from "@/lib/domain/types";
import { ToolLogo } from "./ToolLogo";
import s from "./workspace.module.css";
export function SourcePicker({
  state,
  onSaved,
  initialMission = "",
}: {
  state: StoreState;
  onSaved: () => Promise<void>;
  initialMission?: string;
}) {
  const [location, setLocation] = useState<Location>({
      provider: "sharepoint",
    }),
    [parents, setParents] = useState<Location[]>([]),
    [items, setItems] = useState<RemoteItem[]>([]),
    [cursor, setCursor] = useState<string>(),
    [missionId, setMission] = useState(initialMission),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [accounts, setAccounts] = useState<{ id: string; label: string }[]>([]);
  const [preview, setPreview] = useState<{
    resource: RemoteItem;
    text: string;
    contentHash: string;
  } | null>(null);
  async function call(action: string, where: Location) {
    const response = await fetch("/api/v1/knowledge-browser", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        location: where,
        ...(missionId ? { missionId } : {}),
        ...(action === "import" ? { contentHash: preview?.contentHash } : {}),
      }),
      signal: AbortSignal.timeout(25000),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error ?? "Could not open this source.");
    return data;
  }
  async function chooseAccount() {
    setBusy(true);
    setError("");
    try {
      const data = await call("accounts", location);
      setAccounts(data.accounts);
      if (!data.accounts.length) setError("Connect this tool first.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load accounts.");
    } finally {
      setBusy(false);
    }
  }
  async function browse(where: Location, append = false) {
    setBusy(true);
    setError("");
    setPreview(null);
    try {
      const data = await call("browse", where);
      setItems((old) => (append ? [...old, ...data.items] : data.items));
      setCursor(data.cursor);
      setLocation({ ...where, cursor: undefined });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not browse files.");
    } finally {
      setBusy(false);
    }
  }
  async function open(item: RemoteItem) {
    if (["site", "library", "folder", "database"].includes(item.kind)) {
      setParents((old) => [...old, location]);
      await browse(item.location);
      return;
    }
    setBusy(true);
    setError("");
    try {
      setPreview(await call("preview", item.location));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not preview this file.");
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      await call("import", preview.resource.location);
      await onSaved();
      setNotice(
        `Added ${preview.resource.name}${missionId ? " to this mission" : " to your knowledge"}.`,
      );
      setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add source.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={s.section} aria-label="Choose knowledge sources">
      <h2>Choose what Orbi can know</h2>
      <p>
        Open your tool, choose the exact document, and review its content before
        adding it.
      </p>
      <div
        style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "20px 0" }}
      >
        {[
          ["sharepoint", "SharePoint"],
          ["googledrive", "Google Drive"],
          ["notion", "Notion"],
        ].map(([provider, label]) => (
          <button
            type="button"
            key={provider}
            className={s.secondary}
            aria-pressed={location.provider === provider}
            disabled={busy}
            onClick={() => {
              setLocation({ provider: provider as Location["provider"] });
              setAccounts([]);
              setParents([]);
              setItems([]);
              setPreview(null);
              setCursor(undefined);
              setError("");
              setNotice("");
            }}
          >
            <ToolLogo tool={provider} />
            {label}
          </button>
        ))}
      </div>
      <label>
        Use this knowledge for
        <select
          value={missionId}
          onChange={(e) => setMission(e.target.value)}
          disabled={busy}
        >
          <option value="">My knowledge library</option>
          {state.missions.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className={s.secondary}
        disabled={busy}
        onClick={() => void chooseAccount()}
      >
        Choose connected account
      </button>
      {!!accounts.length && (
        <label>
          Account
          <select
            disabled={busy}
            value={location.accountId ?? ""}
            onChange={(e) => {
              setLocation({
                provider: location.provider,
                accountId: e.target.value || undefined,
              });
              setItems([]);
              setParents([]);
              setPreview(null);
            }}
          >
            <option value="">Choose an account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <p>
        <small>
          Supported: text files (.txt, .md, .csv), Google documents and simple
          Notion pages. Office files, PDFs and nested Notion blocks need a text
          export in this version.
        </small>
      </p>
      <p>
        <small>
          Workspace members can read imported content. Only selected files enter
          Orbi; selecting a folder opens it for browsing. Refresh sources before
          a new run when their verification is over an hour old.
        </small>
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setParents([]);
          void browse({
            provider: location.provider,
            accountId: location.accountId,
            query,
          });
        }}
        style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "20px 0" }}
      >
        {location.provider !== "googledrive" && (
          <input
            style={{ flex: "1 1 200px" }}
            aria-label="Search sites or pages"
            value={query}
            maxLength={100}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              location.provider === "sharepoint"
                ? "Find a SharePoint site"
                : "Find a Notion page or database"
            }
          />
        )}
        <button className={s.primary} disabled={busy}>
          {busy ? "Opening…" : "Browse my files"}
        </button>
        <Link className={s.secondary} href="/connections">
          Connect a tool
        </Link>
      </form>
      {!!parents.length && (
        <button
          className={s.secondary}
          disabled={busy}
          onClick={() => {
            const parent = parents[parents.length - 1];
            setParents((old) => old.slice(0, -1));
            void browse(parent);
          }}
        >
          <ArrowLeft size={16} /> Back one level
        </button>
      )}
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
      {notice && (
        <p role="status">
          <Check size={16} />
          {notice}
        </p>
      )}
      <div aria-busy={busy}>
        {items.map((item) => (
          <button
            type="button"
            key={item.id}
            disabled={busy}
            className={s.row}
            style={{
              width: "100%",
              textAlign: "left",
              background: "transparent",
              cursor: "pointer",
            }}
            onClick={() => void open(item)}
          >
            {["file", "page"].includes(item.kind) ? (
              <FileText size={20} />
            ) : (
              <Folder size={20} />
            )}
            <span style={{ flex: 1, overflowWrap: "anywhere" }}>
              {item.name}
            </span>
            <small>{item.kind}</small>
          </button>
        ))}
      </div>
      {cursor && (
        <button
          className={s.secondary}
          disabled={busy}
          onClick={() => void browse({ ...location, cursor }, true)}
        >
          Show more
        </button>
      )}
      {preview && (
        <section className={s.section} aria-label="Source preview">
          <h3>{preview.resource.name}</h3>
          <p>
            {preview.text.length.toLocaleString()} characters · visible to your
            workspace
          </p>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              fontFamily: "inherit",
              maxHeight: 300,
              overflow: "auto",
            }}
          >
            {preview.text}
          </pre>
          <button
            className={s.primary}
            disabled={busy}
            onClick={() => void save()}
          >
            Add this source{missionId ? " to mission" : ""}
          </button>{" "}
          <button className={s.secondary} onClick={() => setPreview(null)}>
            Close preview
          </button>
        </section>
      )}
    </section>
  );
}
