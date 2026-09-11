"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/components/shell/WorkspaceProvider";
import type { StoreState } from "@/lib/domain/types";
const pages = [
  ["/chat", "New conversation"],
  ["/today", "Today"],
  ["/catalog", "Marketplace"],
  ["/connections", "Integrations"],
  ["/knowledge", "Knowledge"],
  ["/analytics", "Analytics"],
  ["/settings", "Settings"],
];
export function CommandPalette() {
  const [open, setOpen] = useState(false),
    [q, setQ] = useState(""),
    [cursor, setCursor] = useState(0);
  const router = useRouter();
  const { data } = useWorkspace<StoreState>();
  const panel = useRef<HTMLDivElement>(null);
  const previous = useRef<HTMLElement | null>(null);
  useEffect(() => {
    function toggle() {
      previous.current = document.activeElement as HTMLElement;
      setOpen((v) => !v);
      setQ("");
      setCursor(0);
    }
    function key(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggle();
      }
    }
    window.addEventListener("keydown", key);
    window.addEventListener("orbis:palette", toggle);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("orbis:palette", toggle);
    };
  }, []);
  const results = [
    ...pages.map(([href, label]) => ({ href, label, meta: "Page" })),
    ...(data?.missions ?? [])
      .filter((m) => m.flowId)
      .map((m) => ({
        href: "/missions/" + m.id + "/lab",
        label: m.name,
        meta: "Mission",
      })),
  ]
    .filter((item) =>
      (item.label + " " + item.meta).toLowerCase().includes(q.toLowerCase()),
    )
    .slice(0, 12);
  function close() {
    setOpen(false);
    previous.current?.focus();
  }
  function go(href: string) {
    close();
    router.push(href);
  }
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-ink/25 p-4" onClick={close}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Search workspace"
        className="mx-auto mt-[10vh] max-w-xl overflow-hidden rounded-2xl border border-line bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            close();
          }
          if (e.key === "Tab") {
            const elements =
              panel.current?.querySelectorAll<HTMLElement>("input,button");
            if (!elements?.length) return;
            const first = elements[0],
              last = elements[elements.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <div className="flex border-b border-line">
          <input
            autoFocus
            aria-label="Search pages and missions"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setCursor(0);
            }}
            placeholder="Search pages and missions…"
            className="h-16 min-w-0 flex-1 px-5 outline-none"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((n) =>
                  Math.min(Math.max(results.length - 1, 0), n + 1),
                );
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((n) => Math.max(0, n - 1));
              }
              if (e.key === "Enter" && results[cursor]) {
                e.preventDefault();
                go(results[cursor].href);
              }
            }}
          />
          <button
            onClick={close}
            className="px-4 text-sm text-muted"
            aria-label="Close search"
          >
            Esc
          </button>
        </div>
        <ul className="max-h-80 overflow-auto p-2">
          {results.map((item, index) => (
            <li key={item.href}>
              <button
                className={
                  "flex min-h-12 w-full items-center justify-between gap-4 rounded-lg px-4 text-left " +
                  (index === cursor ? "bg-blue-50" : "hover:bg-blue-50")
                }
                onMouseEnter={() => setCursor(index)}
                onClick={() => go(item.href)}
              >
                <span>{item.label}</span>
                <small className="text-muted">{item.meta}</small>
              </button>
            </li>
          ))}
        </ul>
        {!results.length && (
          <p className="px-5 pb-5 text-muted">
            No match. Try a page name or one of your missions.
          </p>
        )}
      </div>
    </div>
  );
}
