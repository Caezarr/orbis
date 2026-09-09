import { ok } from "@/lib/api/http";
import { getStore } from "@/lib/store/store";

export async function GET() {
  const usage = getStore().usage;
  const totals = usage.reduce(
    (acc, entry) => {
      acc[entry.kind] = Number(((acc[entry.kind] ?? 0) + entry.amountEur).toFixed(2));
      acc.all = Number((acc.all + entry.amountEur).toFixed(2));
      return acc;
    },
    { provider: 0, platform: 0, connector: 0, human_review: 0, all: 0 } as Record<string, number>,
  );
  return ok({ items: usage, totals });
}
