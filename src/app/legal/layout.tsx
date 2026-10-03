import type { Metadata } from "next";
import Link from "next/link";
import { LegalLinks } from "@/components/legal/LegalLinks";

export const metadata: Metadata = {
  robots: { index: true, follow: true },
};

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div lang="fr" className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Link href="/" className="text-lg font-medium tracking-tight">
            ← Orbis
          </Link>
          <LegalLinks className="text-sm" />
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-4 pt-6">
        <p
          role="note"
          className="rounded-lg border border-amber/30 bg-amber-soft px-4 py-3 text-sm font-medium text-amber"
        >
          Modèle à faire relire par un avocat — ce document n’est pas un conseil juridique.
        </p>
      </div>
      <main className="legal-doc mx-auto max-w-3xl px-4 pb-16 pt-6 text-[15px] leading-relaxed [&_a]:text-blue [&_a]:underline [&_h1]:mb-2 [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h2]:mb-2 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mb-1 [&_h3]:mt-5 [&_h3]:font-semibold [&_li]:mt-1 [&_p]:mt-3 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-6">
        {children}
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-6">
          <Link href="/" className="text-xs text-muted hover:text-ink">
            Retour à l’accueil
          </Link>
          <LegalLinks />
        </div>
      </footer>
    </div>
  );
}
