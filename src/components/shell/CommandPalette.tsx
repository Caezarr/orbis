"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/components/shell/WorkspaceProvider";
import { postJson } from "@/lib/api/client";
import { getCrew } from "@/lib/capabilities/crews";
import type { Mission, StoreState } from "@/lib/domain/types";
import type { IntentResolution } from "@/lib/runtime/resolver";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hint, setHint] = useState("");
  const router = useRouter();
  const { data } = useWorkspace<StoreState>();

  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape") setOpen(false);
    }
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("orbis:palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("orbis:palette", onOpen);
    };
  }, []);

  const results = useMemo(() => {
    if (!data) return [];
    const query = q.toLowerCase();
    const caps = data.packages
      .filter((pkg) => `${pkg.name} ${pkg.outcome}`.toLowerCase().includes(query) || !query)
      .slice(0, 4)
      .map((pkg) => ({
        id: pkg.slug,
        label: pkg.name,
        meta: getCrew(pkg.slug).whyNow,
        href: `/discover/${pkg.slug}`,
      }));
    const missions = data.missions.slice(0, 3).map((mission) => ({
      id: mission.id,
      label: mission.name,
      meta: mission.state,
      href: `/missions/${mission.id}/lab`,
    }));
    return [
      { id: "today", label: "Today · decisions only", meta: "Inbox", href: "/today" },
      { id: "company", label: "Company blueprint", meta: "How work is installed", href: "/company" },
      ...missions,
      ...caps,
    ].filter((item) => !query || `${item.label} ${item.meta}`.toLowerCase().includes(query));
  }, [data, q]);

  async function ask() {
    if (q.trim().length < 8) return;
    const resolution = await postJson<IntentResolution>("/api/v1/intent-resolutions", { text: q });
    if (resolution.kind === "existing") {
      const created = await postJson<{ mission: Mission }>("/api/v1/missions", { slug: resolution.slug });
      setOpen(false);
      router.push(`/missions/${created.mission.id}/setup`);
      return;
    }
    if (resolution.kind === "composition") {
      setHint(resolution.reason);
      return;
    }
    setHint(resolution.interim);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-ink/30 p-4" onClick={() => setOpen(false)}>
      <div
        className="mx-auto mt-[12vh] max-w-xl overflow-hidden rounded-[14px] border border-line bg-surface shadow-[0_24px_80px_rgba(16,17,20,0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          autoFocus
          value={q}
          onChange={(event) => setQ(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setCursor((n) => Math.min(results.length - 1, n + 1));
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setCursor((n) => Math.max(0, n - 1));
            }
            if (event.key === "Enter") {
              event.preventDefault();
              if (q.trim().length >= 8) void ask();
              else if (results[cursor]) {
                setOpen(false);
                router.push(results[cursor].href);
              }
            }
          }}
          placeholder="Ask for work, or jump…  ⌘K"
          className="h-14 w-full border-b border-line px-4 text-base outline-none"
        />
        <ul className="max-h-80 overflow-auto p-2">
          {results.map((item, index) => (
            <li key={item.id}>
              <button
                type="button"
                className={`flex w-full flex-col rounded-[8px] px-3 py-2 text-left ${index === cursor ? "bg-canvas" : "hover:bg-canvas"}`}
                onMouseEnter={() => setCursor(index)}
                onClick={() => {
                  setOpen(false);
                  router.push(item.href);
                }}
              >
                <span className="text-sm font-medium">{item.label}</span>
                <span className="text-xs text-muted">{item.meta}</span>
              </button>
            </li>
          ))}
        </ul>
        {hint ? <p className="border-t border-line px-4 py-3 text-sm text-muted">{hint}</p> : null}
        <p className="border-t border-line px-4 py-2 text-xs text-muted">
          Enter resolves a free-form need. Arrow keys jump. Esc closes.
        </p>
      </div>
    </div>
  );
}
