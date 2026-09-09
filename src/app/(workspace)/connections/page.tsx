"use client";

import { useWorkspace } from "@/components/shell/WorkspaceProvider";
import { postJson } from "@/lib/api/client";
import type { Connection, StoreState } from "@/lib/domain/types";

export default function ConnectionsPage() {
  const { data, reload, loading } = useWorkspace<StoreState>();
  if (loading || !data) return <p className="text-muted">Loading…</p>;

  async function connect(provider: string) {
    await postJson(`/api/v1/connections/${provider}/start`, {});
    await reload();
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="serif text-4xl">Connections</h1>
      <p className="mt-2 text-muted">
        Apps, models and keys. Secrets stay server-side. Production uses a Nango or Composio adapter — this MVP records scopes and a secret reference only.
      </p>
      <ul className="mt-8 space-y-3">
        {data.connections.map((connection) => (
          <ConnectionRow key={connection.id} connection={connection} onStart={() => void connect(connection.provider)} />
        ))}
      </ul>
    </div>
  );
}

function ConnectionRow({
  connection,
  onStart,
}: {
  connection: Connection;
  onStart: () => void;
}) {
  return (
    <li className="flex flex-col gap-3 rounded-[14px] border border-line bg-surface px-5 py-4 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="font-medium">{connection.label}</p>
        <p className="mt-1 text-sm text-muted">{connection.health}</p>
        <p className="mt-1 text-xs text-muted">Scopes: {connection.scopes.join(", ")}</p>
      </div>
      <button
        type="button"
        onClick={onStart}
        className="rounded-[8px] bg-ink px-4 py-2 text-sm text-canvas"
      >
        {connection.status === "connected" ? "Connected" : "Connect"}
      </button>
    </li>
  );
}
