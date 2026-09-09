"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import type { CompanyProfile } from "@/lib/domain/types";

export default function ProfileOnboardingPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<CompanyProfile | null>(null);

  useEffect(() => {
    void fetch("/api/v1/workspace")
      .then((res) => res.json())
      .then((data) => setProfile(data.profile));
  }, []);

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <p className="text-muted">Reading the company…</p>
      </div>
    );
  }

  const facts = profile.claims.filter((c) => c.kind === "fact");
  const hypotheses = profile.claims.filter((c) => c.kind === "hypothesis");
  const missing = profile.claims.filter((c) => c.kind === "missing");

  return (
    <div className="min-h-screen bg-canvas px-6 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between">
          <Logo />
          <p className="text-sm text-muted">2 · Context</p>
        </div>
        <p className="mt-10 text-sm text-muted">We found enough context to suggest a starting point</p>
        <h1 className="serif mt-2 text-4xl">{profile.name}</h1>
        <p className="mt-3 max-w-2xl text-lg leading-8 text-muted">{profile.summary}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {profile.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-surface px-3 py-1 text-xs text-muted">
              {tag}
            </span>
          ))}
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          <ClaimColumn title="Confirmed facts" items={facts} tone="green" />
          <ClaimColumn title="Hypotheses" items={hypotheses} tone="amber" />
          <ClaimColumn title="Still missing" items={missing} tone="muted" />
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => router.push("/onboarding/opportunities")}
            className="rounded-[10px] bg-ink px-5 py-3 text-sm font-medium text-canvas"
          >
            Looks right
          </button>
          <button
            type="button"
            onClick={() => router.push("/onboarding/opportunities")}
            className="rounded-[10px] border border-line bg-surface px-5 py-3 text-sm"
          >
            Continue with gaps
          </button>
        </div>
      </div>
    </div>
  );
}

function ClaimColumn({
  title,
  items,
  tone,
}: {
  title: string;
  items: { id: string; label: string; value: string; sourceUrl?: string }[];
  tone: "green" | "amber" | "muted";
}) {
  const color =
    tone === "green" ? "text-green" : tone === "amber" ? "text-amber" : "text-muted";
  return (
    <section className="rounded-[14px] border border-line bg-surface p-5">
      <h2 className={`text-sm font-medium ${color}`}>{title}</h2>
      <ul className="mt-4 space-y-4">
        {items.map((item) => (
          <li key={item.id}>
            <p className="text-xs uppercase tracking-wide text-muted">{item.label}</p>
            <p className="mt-1 text-sm leading-6">{item.value}</p>
            {item.sourceUrl ? (
              <a href={item.sourceUrl} className="mt-1 inline-block text-xs text-blue">
                Source
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
