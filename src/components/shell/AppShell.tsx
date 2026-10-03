"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  BookOpenCheck,
  Compass,
  FolderOpen,
  Inbox,
  KeyRound,
  LineChart,
  MessageSquare,
  Repeat2,
  Settings,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { LegalLinks } from "@/components/legal/LegalLinks";
import { cn } from "@/lib/cn";
import { FOCUSED_NAV, FROZEN_NAV, isActive, navItems, type NavKey } from "@/lib/product/surfaces";

const ICONS: Record<NavKey, LucideIcon> = {
  today: Sun,
  demandes: Inbox,
  relances: Repeat2,
  fiche: BookOpenCheck,
  rapport: LineChart,
  settings: Settings,
  chat: MessageSquare,
  catalog: Compass,
  connections: KeyRound,
  knowledge: FolderOpen,
  analytics: BarChart3,
};

/** Today announces how many decisions wait (drafts + questions); the shell keeps the last value. */
export const DECISIONS_EVENT = "orbis:decisions";

export function AppShell({
  children,
  workspaceName = "Mon espace",
  userName = "Vous",
  decisionCount,
  full = false,
}: {
  children: React.ReactNode;
  workspaceName?: string;
  userName?: string;
  /** Forced count (frozen surfaces mode); otherwise taken from Today's event. */
  decisionCount?: number;
  full?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [announced, setAnnounced] = useState(0);
  useEffect(() => {
    const listen = (e: Event) => {
      const n = (e as CustomEvent<number>).detail;
      if (Number.isInteger(n) && n >= 0) setAnnounced(n);
    };
    window.addEventListener(DECISIONS_EVENT, listen);
    return () => window.removeEventListener(DECISIONS_EVENT, listen);
  }, []);
  const decisions = decisionCount ?? announced;
  const items = navItems(full);
  const current = items.find((item) => isActive(item, pathname))?.href ?? "";
  const link = (item: (typeof items)[number]) => {
    const active = isActive(item, pathname);
    const Icon = ICONS[item.key];
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-2 rounded-[8px] px-3 py-2 text-sm",
          active ? "bg-blue-50 text-blue-700" : "text-muted hover:text-ink",
        )}
      >
        <Icon size={16} aria-hidden />
        {item.label}
        {item.key === "today" && decisions > 0 ? (
          <span className="ml-auto rounded-full bg-amber-soft px-2 text-xs text-amber" aria-label={`${decisions} à relire`}>
            {decisions}
          </span>
        ) : null}
      </Link>
    );
  };
  return (
    <div className="orbis-workspace min-h-screen bg-white" lang="fr">
      <CommandPalette full={full} />
      <header className="flex h-16 items-center justify-between border-b border-[#dce4f0] bg-white px-5">
        <div className="flex min-w-0 items-center gap-6">
          <Link href="/today" aria-label="Orbis, aller à Aujourd’hui">
            <span className="flex items-center gap-2 text-xl font-medium tracking-tight">
              <Image src="/brand/orbis-mark.svg" alt="" width={28} height={28} />
              Orbis
            </span>
          </Link>
          <Link
            href={full ? "/company" : "/fiche"}
            className="hidden truncate rounded-[8px] border border-line bg-surface px-3 py-1.5 text-sm sm:block"
          >
            {workspaceName}
          </Link>
        </div>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("orbis:palette"))}
          className="hidden h-9 items-center gap-3 rounded-[8px] border border-line bg-surface px-3 text-sm text-muted md:flex"
        >
          Aller à…
          <kbd className="rounded bg-canvas px-1.5 py-0.5 text-[10px]">⌘K</kbd>
        </button>
        <div className="flex items-center gap-3 text-sm text-muted">
          {decisions > 0 ? (
            <Link href="/today" className="rounded-full bg-amber-soft px-3 py-1 text-xs text-amber">
              {decisions} à relire
            </Link>
          ) : null}
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-xs text-canvas"
            title={userName}
          >
            {userName.slice(0, 1).toUpperCase()}
          </span>
        </div>
      </header>
      <nav aria-label="Navigation de l’espace (mobile)" className="border-b border-[#dce4f0] bg-white px-4 py-3 md:hidden">
        <label className="flex items-center gap-4 text-sm text-muted">
          Aller à
          <select
            aria-label="Page de l’espace"
            value={current}
            onChange={(e) => router.push(e.target.value)}
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-white px-3 text-base text-ink"
          >
            <option value="" disabled>
              Choisir une page
            </option>
            {items.map((item) => (
              <option key={item.href} value={item.href}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </nav>
      <div className="flex min-h-[calc(100vh-64px)]">
        <aside className="hidden w-[230px] shrink-0 flex-col border-r border-[#e2e9f3] bg-[#f8faff] md:flex">
          <nav aria-label="Navigation de l’espace" className="flex flex-col gap-1 p-3">
            {FOCUSED_NAV.map(link)}
            {full ? (
              <>
                <p className="mt-5 px-3 text-xs uppercase tracking-wide text-muted">Gelé en V1</p>
                {FROZEN_NAV.map(link)}
              </>
            ) : null}
          </nav>
          <LegalLinks className="mt-auto px-6 pb-4 pt-6" />
        </aside>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-7 md:py-8">
          {children}
          <LegalLinks className="mt-10 border-t border-line pt-4 md:hidden" />
        </main>
      </div>
    </div>
  );
}
