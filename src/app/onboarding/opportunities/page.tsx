"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import { CapabilityCard } from "@/components/cards/CapabilityCard";
import { postJson } from "@/lib/api/client";
import { recommendSlugs } from "@/lib/runtime/recommend";
import type { CapabilityPackage, CompanyProfile, Mission } from "@/lib/domain/types";
import Link from "next/link";

export default function OpportunitiesPage() {
  const router = useRouter();
  const [packages, setPackages] = useState<CapabilityPackage[]>([]);
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/v1/workspace")
      .then((res) => res.json())
      .then((data) => {
        setProfile(data.profile);
        setPackages(data.packages);
      });
  }, []);

  const recs = recommendSlugs(profile)
    .map((slug) => packages.find((pkg) => pkg.slug === slug))
    .filter((pkg): pkg is CapabilityPackage => Boolean(pkg));

  async function tryPackage(slug: string) {
    setBusy(slug);
    const created = await postJson<{ mission: Mission }>("/api/v1/missions", { slug });
    router.push(`/missions/${created.mission.id}/setup`);
  }

  return (
    <div className="min-h-screen bg-canvas px-6 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between">
          <Logo />
          <p className="text-sm text-muted">3 · Your OS</p>
        </div>
        <h1 className="serif mt-10 text-4xl">Work we can install first</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Each card is a result, not an agent count. Try one. External writes stay off in test mode.
        </p>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {recs.map((pkg) => (
            <div key={pkg.slug} className="flex flex-col">
              <CapabilityCard pkg={pkg} href={`/discover/${pkg.slug}`} />
              <button
                type="button"
                disabled={busy === pkg.slug || pkg.maturity === "planned"}
                onClick={() => void tryPackage(pkg.slug)}
                className="mt-3 rounded-[10px] bg-ink px-4 py-2.5 text-sm font-medium text-canvas disabled:opacity-40"
              >
                {pkg.maturity === "ready" ? "Try this" : "Explore"}
              </button>
            </div>
          ))}
        </div>
        <div className="mt-8 flex gap-4 text-sm">
          <Link href="/discover" className="text-ink underline-offset-4 hover:underline">
            Browse all capabilities
          </Link>
          <Link href="/discover/request" className="text-muted hover:text-ink">
            Describe another need
          </Link>
        </div>
      </div>
    </div>
  );
}
