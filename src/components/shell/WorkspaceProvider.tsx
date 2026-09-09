"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

type Snapshot = Record<string, unknown> & {
  workspace?: { name: string };
  memberships?: { name: string }[];
  decisions?: unknown[];
  profile?: { name: string } | null;
};

const Ctx = createContext<{
  data: Snapshot | null;
  loading: boolean;
  reload: () => Promise<void>;
}>({ data: null, loading: true, reload: async () => {} });

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    const res = await fetch("/api/v1/workspace", { cache: "no-store" });
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return <Ctx.Provider value={{ data, loading, reload }}>{children}</Ctx.Provider>;
}

export function useWorkspace<T = Snapshot>() {
  return useContext(Ctx) as { data: T | null; loading: boolean; reload: () => Promise<void> };
}
