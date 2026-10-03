/* In-memory daily budget (per instance). The shared, authoritative store is
 * src/lib/platform/limits.ts (migration 012); this one is its fast pre-check. */
/** Daily (UTC) budget in cents, global + per key. Reservations are never refunded. */
export function createDailyBudget(options: { capCents: number; perKeyCapCents: number; maxKeys?: number }) {
  let day = "";
  let spent = 0;
  const perKey = new Map<string, number>();
  return {
    reserve(key: string, cents: number, now = Date.now()) {
      const today = new Date(now).toISOString().slice(0, 10);
      if (today !== day) {
        day = today;
        spent = 0;
        perKey.clear();
      }
      const mine = perKey.get(key) ?? 0;
      if (spent + cents > options.capCents) return { allowed: false as const, scope: "global" as const };
      if (mine + cents > options.perKeyCapCents) return { allowed: false as const, scope: "key" as const };
      spent += cents;
      perKey.delete(key);
      perKey.set(key, mine + cents);
      while (perKey.size > (options.maxKeys ?? 5000)) {
        const oldest = perKey.keys().next().value;
        if (oldest === undefined) break;
        perKey.delete(oldest);
      }
      return { allowed: true as const };
    },
    spent: () => spent,
  };
}
export type DailyBudget = ReturnType<typeof createDailyBudget>;
