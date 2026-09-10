"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";

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
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    const res = await fetch("/api/v1/workspace", { cache: "no-store" });
    if (!res.ok) throw new Error("Could not load workspace");
    const json = await res.json();
    setData(json);
    setLoading(false);
    setError("");
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      void reload().catch(() => {
        setError("Could not load your workspace.");
        setLoading(false);
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [reload]);
  return (
    <Ctx.Provider value={{ data, loading, reload }}>
      {error ? (
        <div role="alert" className="m-8 rounded-xl border p-6">
          {error}{" "}
          <button
            className="ml-3 underline"
            onClick={() => {
              void reload().catch(() =>
                setError(
                  "Still unavailable. Check the local server and retry.",
                ),
              );
            }}
          >
            Retry
          </button>
        </div>
      ) : (
        children
      )}
    </Ctx.Provider>
  );
}

export function useWorkspace<T = Snapshot>() {
  return useContext(Ctx) as {
    data: T | null;
    loading: boolean;
    reload: () => Promise<void>;
  };
}
