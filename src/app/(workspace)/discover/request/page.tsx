"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/lib/api/client";
import type { IntentResolution } from "@/lib/runtime/resolver";
import type { Mission } from "@/lib/domain/types";
import { MaturityBadge } from "@/components/ui/MaturityBadge";

export default function RequestPage() {
  const router = useRouter();
  const [text, setText] = useState("Analyze incoming customer requests and prepare a reply without inventing prices.");
  const [result, setResult] = useState<IntentResolution | null>(null);
  const [busy, setBusy] = useState(false);

  async function resolve() {
    setBusy(true);
    const data = await postJson<IntentResolution>("/api/v1/intent-resolutions", { text });
    setResult(data);
    setBusy(false);
  }

  async function install(slug: string) {
    const created = await postJson<{ mission: Mission }>("/api/v1/missions", { slug });
    router.push(`/missions/${created.mission.id}/setup`);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="serif text-4xl">Describe the work</h1>
      <p className="mt-2 text-muted">
        The resolver finds an existing package, a bounded composition, or explains what is missing.
      </p>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={5}
        className="mt-6 w-full rounded-[14px] border border-line bg-surface p-4"
      />
      <button
        type="button"
        onClick={() => void resolve()}
        disabled={busy}
        className="mt-4 rounded-[10px] bg-ink px-5 py-3 text-sm text-canvas"
      >
        Resolve
      </button>

      {result?.kind === "existing" ? (
        <section className="mt-8 rounded-[14px] border border-line bg-surface p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">{result.package.name}</h2>
            <MaturityBadge maturity={result.package.maturity} />
          </div>
          <p className="mt-2 text-sm text-muted">{result.reason}</p>
          <button
            type="button"
            onClick={() => void install(result.slug)}
            className="mt-4 rounded-[10px] bg-ink px-4 py-2 text-sm text-canvas"
          >
            Install this package
          </button>
        </section>
      ) : null}

      {result?.kind === "composition" ? (
        <section className="mt-8 rounded-[14px] border border-line bg-surface p-6">
          <h2 className="font-medium">Bounded composition</h2>
          <p className="mt-2 text-sm text-muted">{result.reason}</p>
          <ul className="mt-4 space-y-2 text-sm">
            {result.packages.map((pkg) => (
              <li key={pkg.slug}>
                {pkg.name} · {pkg.maturity}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => void install(result.slugs[0])}
            className="mt-4 rounded-[10px] bg-ink px-4 py-2 text-sm text-canvas"
          >
            Start with the ready primitive
          </button>
        </section>
      ) : null}

      {result?.kind === "unsupported" ? (
        <section className="mt-8 rounded-[14px] border border-line bg-amber-soft p-6">
          <h2 className="font-medium">Not a package yet</h2>
          <p className="mt-2 text-sm">{result.reason}</p>
          <p className="mt-2 text-sm text-muted">{result.interim}</p>
        </section>
      ) : null}
    </div>
  );
}
