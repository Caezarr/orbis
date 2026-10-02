import Link from "next/link";
import { cn } from "@/lib/cn";

export const LEGAL_PAGES = [
  { href: "/legal/cgu", label: "CGU" },
  { href: "/legal/confidentialite", label: "Confidentialité" },
  { href: "/legal/sous-traitants", label: "Sous-traitants" },
  { href: "/legal/mentions", label: "Mentions légales" },
] as const;

/** Inline links « CGU · Confidentialité · Sous-traitants · Mentions légales ». */
export function LegalLinks({ className }: { className?: string }) {
  return (
    <nav
      aria-label="Informations légales"
      lang="fr"
      className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted", className)}
    >
      {LEGAL_PAGES.map((page, i) => (
        <span key={page.href} className="flex items-center gap-1.5">
          {i > 0 ? <span aria-hidden>·</span> : null}
          <Link href={page.href} className="underline-offset-2 hover:text-ink hover:underline">
            {page.label}
          </Link>
        </span>
      ))}
    </nav>
  );
}
