"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  Compass,
  FolderOpen,
  KeyRound,
  LayoutGrid,
  Settings,
  Sun,
} from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/today", label: "Today", icon: Sun },
  { href: "/company", label: "Company", icon: Building2 },
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/missions", label: "Missions", icon: LayoutGrid },
  { href: "/knowledge", label: "Knowledge", icon: FolderOpen },
  { href: "/connections", label: "Connections", icon: KeyRound },
];

export function AppShell({
  children,
  workspaceName = "Acme",
  userName = "Gabriel",
  decisionCount = 0,
}: {
  children: React.ReactNode;
  workspaceName?: string;
  userName?: string;
  decisionCount?: number;
}) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen bg-canvas">
      <CommandPalette />
      <header className="flex h-14 items-center justify-between border-b border-line px-5">
        <div className="flex items-center gap-6">
          <Link href="/today" aria-label="Orbis home">
            <Logo />
          </Link>
          <button type="button" className="rounded-[8px] border border-line bg-surface px-3 py-1.5 text-sm">
            {workspaceName} ▾
          </button>
        </div>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("orbis:palette"))}
          className="hidden h-9 items-center gap-3 rounded-[8px] border border-line bg-surface px-3 text-sm text-muted md:flex"
        >
          Ask or jump
          <kbd className="rounded bg-canvas px-1.5 py-0.5 text-[10px]">⌘K</kbd>
        </button>
        <div className="flex items-center gap-3 text-sm text-muted">
          {decisionCount > 0 ? (
            <Link href="/today" className="rounded-full bg-amber-soft px-3 py-1 text-xs text-amber">
              {decisionCount} need you
            </Link>
          ) : null}
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-xs text-canvas">
            {userName.slice(0, 1)}
          </span>
        </div>
      </header>
      <div className="flex min-h-[calc(100vh-56px)]">
        <aside className="hidden w-[220px] shrink-0 border-r border-line md:block">
          <nav className="flex flex-col gap-1 p-3">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-[8px] px-3 py-2 text-sm",
                    active ? "bg-surface text-ink" : "text-muted hover:text-ink",
                  )}
                >
                  <Icon size={16} aria-hidden />
                  {item.label}
                  {item.href === "/today" && decisionCount > 0 ? (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-amber pulse-dot" />
                  ) : null}
                </Link>
              );
            })}
            <Link
              href="/settings"
              className={cn(
                "mt-4 flex items-center gap-2 rounded-[8px] px-3 py-2 text-sm",
                pathname.startsWith("/settings") ? "bg-surface text-ink" : "text-muted hover:text-ink",
              )}
            >
              <Settings size={16} aria-hidden />
              Settings
            </Link>
          </nav>
        </aside>
        <main className="min-w-0 flex-1 px-6 py-8 md:px-10">{children}</main>
      </div>
    </div>
  );
}
