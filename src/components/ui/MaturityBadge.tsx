import type { Maturity } from "@/lib/domain/types";
import { cn } from "@/lib/cn";

const MAP: Record<Maturity, { label: string; className: string }> = {
  planned: { label: "Planned", className: "bg-line text-muted" },
  composable: { label: "Composable", className: "bg-amber-soft text-amber" },
  ready: { label: "Ready to test", className: "bg-green-soft text-green" },
  supervised: { label: "Supervised", className: "bg-blue-soft text-blue" },
  autonomy_scoped: { label: "Autonomy scoped", className: "bg-blue-soft text-blue" },
};

export function MaturityBadge({ maturity }: { maturity: Maturity }) {
  const item = MAP[maturity];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        item.className,
      )}
    >
      {item.label}
    </span>
  );
}
