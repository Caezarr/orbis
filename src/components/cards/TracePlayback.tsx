"use client";

import { useEffect, useState } from "react";
import type { StepRun } from "@/lib/domain/types";
import { formatEuro } from "@/lib/time";

export function TracePlayback({
  steps,
  model,
  cost,
  autoPlay = true,
}: {
  steps: StepRun[];
  model?: string;
  cost?: { provider: number; platform: number };
  autoPlay?: boolean;
}) {
  const [shown, setShown] = useState(autoPlay ? 0 : steps.length);

  useEffect(() => {
    if (!autoPlay || shown >= steps.length) return;
    const delay = Math.min(900, steps[shown]?.durationMs ?? 400);
    const timer = window.setTimeout(() => setShown((n) => n + 1), delay);
    return () => window.clearTimeout(timer);
  }, [autoPlay, shown, steps]);

  const tokens = steps.slice(0, shown).reduce((sum, step) => sum + (step.tokens ?? 0), 0);
  const ms = steps.slice(0, shown).reduce((sum, step) => sum + (step.durationMs ?? 0), 0);

  return (
    <div>
      <div className="flex flex-wrap gap-3 text-xs text-muted">
        {model ? <span>Model · {model}</span> : null}
        {cost ? (
          <span>
            Cost · {formatEuro(cost.provider)} provider / {formatEuro(cost.platform)} platform
          </span>
        ) : null}
        <span>Tokens · {tokens}</span>
        <span>Wall · {ms}ms</span>
      </div>
      <ol className="mt-4 space-y-2">
        {steps.map((step, index) => {
          const visible = index < shown;
          return (
            <li
              key={step.id}
              className={`rounded-[10px] border px-3 py-2 text-sm transition ${
                visible ? "border-line bg-canvas" : "border-transparent text-transparent"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">
                  {step.role ? `${step.role} · ` : ""}
                  {step.name}
                </span>
                <span
                  className={
                    step.status === "denied"
                      ? "text-amber"
                      : step.status === "failed"
                        ? "text-red"
                        : "text-green"
                  }
                >
                  {step.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">{step.detail}</p>
              {step.tokens ? (
                <p className="mt-1 text-[11px] text-muted">
                  {step.tokens} tokens · {step.durationMs}ms
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
