"use client";
import { useState } from "react";
import s from "./workspace.module.css";
export function SourceActions({
  id,
  remote,
  reload,
}: {
  id: string;
  remote: boolean;
  reload: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function update(action: string) {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch(`/api/v1/sources/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Could not update source.");
      await reload();
      setMessage(
        data.error ??
          (data.status === "ready" ? "Source refreshed." : "Source withdrawn."),
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      {remote && (
        <button
          className={s.secondary}
          disabled={busy}
          onClick={() => void update("refresh")}
        >
          Refresh from tool
        </button>
      )}{" "}
      <button
        className={s.secondary}
        disabled={busy}
        onClick={() => void update("revoke")}
      >
        Withdraw source
      </button>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
