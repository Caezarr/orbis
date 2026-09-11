"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  Compass,
  FolderOpen,
  KeyRound,
  Settings,
  Sun,
  MessageSquare,
  BarChart3,
} from "lucide-react";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/chat", label: "Ask Orbi", icon: MessageSquare },
  { href: "/today", label: "Today", icon: Sun },
  { href: "/catalog", label: "Marketplace", icon: Compass },
  { href: "/connections", label: "Integrations", icon: KeyRound },
  { href: "/knowledge", label: "Knowledge", icon: FolderOpen },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
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
  const router = useRouter();
  return (
    <div className="orbis-workspace min-h-screen bg-white">
      <CommandPalette />
      <header className="flex h-16 items-center justify-between border-b border-[#dce4f0] bg-white px-5">
        <div className="flex items-center gap-6">
          <Link href="/chat" aria-label="Orbis home">
            <span className="flex items-center gap-2 text-xl font-medium tracking-tight">
              <Image
                src="/brand/orbis-mark.svg"
                alt=""
                width={28}
                height={28}
              />
              Orbis
            </span>
          </Link>
          <Link
            href="/company"
            className="rounded-[8px] border border-line bg-surface px-3 py-1.5 text-sm"
          >
            {workspaceName}
          </Link>
        </div>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("orbis:palette"))}
          className="hidden h-9 items-center gap-3 rounded-[8px] border border-line bg-surface px-3 text-sm text-muted md:flex"
        >
          Search workspace
          <kbd className="rounded bg-canvas px-1.5 py-0.5 text-[10px]">⌘K</kbd>
        </button>
        <div className="flex items-center gap-3 text-sm text-muted">
          {decisionCount > 0 ? (
            <Link
              href="/today"
              className="rounded-full bg-amber-soft px-3 py-1 text-xs text-amber"
            >
              {decisionCount} need you
            </Link>
          ) : null}
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-xs text-canvas">
            {userName.slice(0, 1)}
          </span>
        </div>
      </header>
      <nav
        aria-label="Mobile workspace navigation"
        className="border-b border-[#dce4f0] bg-white px-4 py-3 md:hidden"
      >
        <label className="flex items-center gap-4 text-sm text-muted">
          Go to
          <select
            aria-label="Workspace page"
            value={
              pathname.startsWith("/workflows/")
                ? "/catalog"
                : ([...NAV, { href: "/settings" }].find((item) =>
                    pathname.startsWith(item.href),
                  )?.href ?? "")
            }
            onChange={(e) => router.push(e.target.value)}
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-white px-3 text-base text-ink"
          >
            <option value="" disabled>
              Workspace
            </option>
            {[...NAV, { href: "/settings", label: "Settings" }].map((item) => (
              <option key={item.href} value={item.href}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </nav>
      <div className="flex min-h-[calc(100vh-64px)]">
        <aside className="hidden w-[230px] shrink-0 border-r border-[#e2e9f3] bg-[#f8faff] md:block">
          <nav className="flex flex-col gap-1 p-3">
            {NAV.map((item) => {
              const active =
                pathname === item.href ||
                pathname.startsWith(`${item.href}/`) ||
                (item.href === "/catalog" &&
                  pathname.startsWith("/workflows/"));
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-[8px] px-3 py-2 text-sm",
                    active
                      ? "bg-blue-50 text-blue-700"
                      : "text-muted hover:text-ink",
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
                pathname.startsWith("/settings")
                  ? "bg-surface text-ink"
                  : "text-muted hover:text-ink",
              )}
            >
              <Settings size={16} aria-hidden />
              Settings
            </Link>
          </nav>
        </aside>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-7 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
