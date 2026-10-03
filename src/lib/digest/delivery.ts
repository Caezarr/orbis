import { createHash } from "node:crypto";
import { canonical } from "@/lib/integrations/action-broker";
import type { DigestMessage } from "./compose";

/*
 * Broker step for the one outbound notification Orbis prepares: the daily
 * digest to the subscriber's own account address. It is not a mailbox action
 * (Orbis never sends from the customer's mailbox) and it has no model in the
 * loop: the recipient is the address stored at opt-in from the verified
 * session, the content is counts only (compose.ts).
 *
 * Delivery modes (ORBIS_DIGEST_DELIVERY):
 *  - unset / "simulated": the digest is composed and recorded, nothing leaves
 *    the server. This is the only mode built today.
 *  - anything else: refused. A real transport (provider choice, sending domain,
 *    SPF/DKIM, provider idempotency key) needs an owner decision first; it must
 *    be added here, behind the same policy hash and ledger claim.
 */
export const DIGEST_ACTION = "orbis.digest.send";
export type DigestDeliveryMode = "simulated" | "unsupported";
export type DigestOutcome = "simulated" | "sent" | "refused" | "failed";

export function digestDeliveryMode(env: Record<string, string | undefined> = process.env): DigestDeliveryMode {
  const value = env.ORBIS_DIGEST_DELIVERY?.trim();
  return !value || value === "simulated" ? "simulated" : "unsupported";
}

const sha256 = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");

/** The policy this delivery runs under; recorded on every ledger row. */
export function digestPolicyHash(mode: DigestDeliveryMode) {
  return sha256({
    action: DIGEST_ACTION,
    version: 1,
    recipient: "subscriber_verified_account_email",
    content: "counts_only",
    schedule: "once_per_europe_paris_day_after_0700",
    optIn: "explicit_per_user",
    mode,
  });
}
/** One claim per workspace, user and Europe/Paris day. */
export function digestIdempotencyKey(ids: { tenantId: string; workspaceId: string; userId: string }, day: string) {
  return sha256({ action: DIGEST_ACTION, tenantId: ids.tenantId, workspaceId: ids.workspaceId, userId: ids.userId, day });
}

const EMAIL = /^[^\s@<>()",;:\\[\]]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,63}$/;
export function isDeliverableAddress(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 && EMAIL.test(value);
}

export async function deliverDigest(
  message: DigestMessage,
  request: { recipient: string; mode: DigestDeliveryMode; idempotencyKey: string; policyHash: string },
): Promise<{ outcome: DigestOutcome; payloadHash: string }> {
  const payloadHash = sha256({ to: request.recipient, ...message, idempotencyKey: request.idempotencyKey, policyHash: request.policyHash });
  if (typeof window !== "undefined") return { outcome: "refused", payloadHash };
  if (request.policyHash !== digestPolicyHash(request.mode)) return { outcome: "refused", payloadHash };
  if (!isDeliverableAddress(request.recipient)) return { outcome: "refused", payloadHash };
  if (message.subject.length > 200 || message.text.length > 4_000 || message.html.length > 8_000)
    return { outcome: "refused", payloadHash };
  if (request.mode === "simulated") return { outcome: "simulated", payloadHash };
  return { outcome: "refused", payloadHash };
}
