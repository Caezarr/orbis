"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { ConnectionPanel } from "@/components/product/ConnectionPanel";
import s from "@/components/product/workspace.module.css";
export default function Page() {
  const [runtime, setRuntime] = useState<{
      configured: boolean;
      provider: string;
      model: string;
    } | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/v1/runtime")
      .then(async (r) => {
        if (!r.ok) throw new Error("Could not check your AI provider.");
        return r.json();
      })
      .then(setRuntime)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <div className={s.page}>
      <header className={s.head}>
        <div>
          <h1>Integrations</h1>
          <p>Your tools. The right access for each mission.</p>
        </div>
        <Link href="/plans" className={s.primary}>
          Manage mission tools
        </Link>
      </header>
      <ConnectionPanel />
      <section className={s.section}>
        <h2>AI provider</h2>
        {error ? (
          <p role="alert" className={s.error}>
            {error}
          </p>
        ) : (
          <p>
            {runtime
              ? runtime.configured
                ? runtime.provider +
                  " · " +
                  runtime.model +
                  " · Server configuration found"
                : "No AI provider configured"
              : "Checking provider…"}
          </p>
        )}
        <details className="mt-5">
          <summary className="cursor-pointer">Administrator setup</summary>
          <p className="mt-3">
            Set ORBIS_AI_PROVIDER, ORBIS_AI_MODEL and OPENAI_API_KEY or
            ANTHROPIC_API_KEY on the server, then restart. Credentials never
            belong in knowledge sources. A configured key still needs a
            successful execution to verify access.
          </p>
        </details>
      </section>
    </div>
  );
}
