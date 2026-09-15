import { integer, type RateCard } from "./rates";

export type QuoteLine = Readonly<{
  kind: "task" | "media";
  rateId: string;
  label: string;
  units: number;
  unitCents: number;
  totalCents: number;
}>;
export type TaskQuote = Readonly<{
  id: string;
  tenantId: string;
  outcomeKey: string;
  rateCardVersion: string;
  currency: "EUR";
  createdAt: number;
  expiresAt: number;
  lines: readonly QuoteLine[];
  totalCents: number;
}>;
export type QuoteRequest = {
  id: string;
  tenantId: string;
  outcomeKey: string;
  verticalId: string;
  createdAt: number;
  expiresAt: number;
  media?: readonly { rateId: string; units: number }[];
};
function text(value: string) {
  if (typeof value !== "string" || !value.trim() || value.length > 250)
    throw new Error("INVALID_ID");
}
function line(
  kind: QuoteLine["kind"],
  rateId: string,
  label: string,
  units: number,
  unitCents: number,
): QuoteLine {
  text(rateId);
  text(label);
  integer(units, "UNITS", 1);
  integer(unitCents, "CENTS");
  return Object.freeze({
    kind,
    rateId,
    label,
    units,
    unitCents,
    totalCents: integer(units * unitCents, "TOTAL"),
  });
}
function snapshot(q: TaskQuote): TaskQuote {
  [q.id, q.tenantId, q.outcomeKey, q.rateCardVersion].forEach(text);
  integer(q.createdAt, "TIME");
  integer(q.expiresAt, "TIME");
  if (q.currency !== "EUR" || q.expiresAt <= q.createdAt || q.lines.length < 1)
    throw new Error("INVALID_QUOTE");
  const seen = new Set<string>();
  const lines = q.lines.map((l, i) => {
    if (
      (i === 0 ? l.kind !== "task" || l.units !== 1 : l.kind !== "media") ||
      seen.has(`${l.kind}:${l.rateId}`)
    )
      throw new Error("INVALID_LINES");
    seen.add(`${l.kind}:${l.rateId}`);
    const copy = line(l.kind, l.rateId, l.label, l.units, l.unitCents);
    if (copy.totalCents !== l.totalCents) throw new Error("INVALID_TOTAL");
    return copy;
  });
  const totalCents = integer(
    lines.reduce((n, l) => n + l.totalCents, 0),
    "TOTAL",
  );
  if (totalCents !== q.totalCents) throw new Error("INVALID_TOTAL");
  return Object.freeze({
    id: q.id,
    tenantId: q.tenantId,
    outcomeKey: q.outcomeKey,
    rateCardVersion: q.rateCardVersion,
    currency: q.currency,
    createdAt: q.createdAt,
    expiresAt: q.expiresAt,
    lines: Object.freeze(lines),
    totalCents,
  });
}
export function createQuote(card: RateCard, request: QuoteRequest): TaskQuote {
  text(card.version);
  for (const rates of [card.tasks, card.media]) {
    if (new Set(rates.map((r) => r.id)).size !== rates.length)
      throw new Error("DUPLICATE_RATE");
  }
  const rate = card.tasks.find((r) => r.id === request.verticalId);
  if (!rate) throw new Error("UNKNOWN_TASK_RATE");
  const lines = [line("task", rate.id, rate.label, 1, rate.taskCents)];
  for (const item of [...(request.media ?? [])].sort((a, b) =>
    a.rateId.localeCompare(b.rateId),
  )) {
    const media = card.media.find((r) => r.id === item.rateId);
    if (!media) throw new Error("UNKNOWN_MEDIA_RATE");
    lines.push(
      line("media", media.id, media.label, item.units, media.unitCents),
    );
  }
  return snapshot({
    id: request.id,
    tenantId: request.tenantId,
    outcomeKey: request.outcomeKey,
    rateCardVersion: card.version,
    currency: card.currency,
    createdAt: request.createdAt,
    expiresAt: request.expiresAt,
    lines,
    totalCents: lines.reduce((n, l) => n + l.totalCents, 0),
  });
}

export type Reservation = Readonly<{
  quote: TaskQuote;
  state: "reserved" | "settled" | "released" | "refunded";
  cashCents: number;
  includedTasks: number;
  acceptedAt: number;
  closedAt: number | null;
}>;
/** JSON portable. One account represents one tenant/billing period; budget is a cap, not a payment. */
export type BillingAccount = Readonly<{
  tenantId: string;
  periodId: string;
  budgetCents: number;
  includedTasks: number;
  revision: number;
  reservations: readonly Reservation[];
}>;
export function createAccount(
  tenantId: string,
  periodId: string,
  budgetCents: number,
  includedTasks = 0,
): BillingAccount {
  text(tenantId);
  text(periodId);
  integer(budgetCents, "BUDGET");
  integer(includedTasks, "TASKS");
  return Object.freeze({
    tenantId,
    periodId,
    budgetCents,
    includedTasks,
    revision: 0,
    reservations: Object.freeze([]),
  });
}
export function balance(account: BillingAccount) {
  let heldCents = 0,
    spentCents = 0,
    usedTasks = 0;
  for (const r of account.reservations) {
    if (r.state === "reserved") heldCents += r.cashCents;
    if (r.state === "settled") spentCents += r.cashCents;
    if (r.state === "reserved" || r.state === "settled")
      usedTasks += r.includedTasks;
  }
  return {
    heldCents,
    spentCents,
    availableCents: account.budgetCents - heldCents - spentCents,
    availableTasks: account.includedTasks - usedTasks,
  };
}
function replace(account: BillingAccount, r: Reservation): BillingAccount {
  const others = account.reservations.filter(
    (item) => item.quote.outcomeKey !== r.quote.outcomeKey,
  );
  return Object.freeze({
    ...account,
    revision: integer(account.revision + 1, "REVISION"),
    reservations: Object.freeze([...others, Object.freeze(r)]),
  });
}
/** Accept only a server-stored quote; acceptance binds the full snapshot, including media units. */
export function reserve(
  account: BillingAccount,
  quote: TaskQuote,
  acceptance: { quoteId: string; acceptedTotalCents: number; at: number },
): BillingAccount {
  const q = snapshot(quote);
  integer(acceptance.at, "TIME");
  if (q.tenantId !== account.tenantId) throw new Error("TENANT_MISMATCH");
  if (
    acceptance.quoteId !== q.id ||
    acceptance.acceptedTotalCents !== q.totalCents
  )
    throw new Error("QUOTE_NOT_ACCEPTED");
  const existing = account.reservations.find(
    (r) => r.quote.outcomeKey === q.outcomeKey,
  );
  if (existing) {
    if (JSON.stringify(existing.quote) !== JSON.stringify(q))
      throw new Error("IDEMPOTENCY_CONFLICT");
    return account;
  }
  if (account.reservations.some((r) => r.quote.id === q.id))
    throw new Error("QUOTE_ID_CONFLICT");
  if (acceptance.at < q.createdAt || acceptance.at >= q.expiresAt)
    throw new Error("QUOTE_EXPIRED");
  const available = balance(account);
  const includedTasks = available.availableTasks > 0 ? 1 : 0;
  const cashCents = q.totalCents - includedTasks * q.lines[0].totalCents;
  if (cashCents > available.availableCents)
    throw new Error("INSUFFICIENT_BUDGET");
  return replace(account, {
    quote: q,
    state: "reserved",
    cashCents,
    includedTasks,
    acceptedAt: acceptance.at,
    closedAt: null,
  });
}
function get(account: BillingAccount, outcomeKey: string, at: number) {
  integer(at, "TIME");
  const r = account.reservations.find((r) => r.quote.outcomeKey === outcomeKey);
  if (!r) throw new Error("RESERVATION_NOT_FOUND");
  if (at < r.acceptedAt) throw new Error("INVALID_TIME");
  return r;
}
/** Status is the authoritative final business outcome, never an individual attempt status.
 * Unknown/new provider statuses deliberately hold funds. Success means accepted deliverable.
 */
export function settle(
  account: BillingAccount,
  outcomeKey: string,
  status: string,
  at: number,
): BillingAccount {
  const r = get(account, outcomeKey, at);
  if (r.state !== "reserved") return account; // terminal outcomes cannot bill again
  if (status !== "succeeded" && status !== "failed" && status !== "cancelled")
    return account;
  return replace(account, {
    ...r,
    state: status === "succeeded" ? "settled" : "released",
    closedAt: at,
  });
}
export function release(
  account: BillingAccount,
  outcomeKey: string,
  reason: "failed" | "cancelled",
  at: number,
): BillingAccount {
  if (reason !== "failed" && reason !== "cancelled")
    throw new Error("INVALID_RELEASE_REASON");
  return settle(account, outcomeKey, reason, at);
}
/** Full domain refund restores both cash cap and included unit. No payment rail invoked. */
export function refund(
  account: BillingAccount,
  outcomeKey: string,
  at: number,
): BillingAccount {
  const r = get(account, outcomeKey, at);
  if (r.state === "refunded") return account;
  if (r.state !== "settled") throw new Error("NOT_SETTLED");
  if (at < r.closedAt!) throw new Error("INVALID_TIME");
  return replace(account, { ...r, state: "refunded", closedAt: at });
}
