import { createHash } from "node:crypto";
import { nanoid } from "nanoid";

export function id(prefix: string) {
  return `${prefix}_${nanoid(12)}`;
}

/** Short, stable content hash (16 hex chars) used for policy and context snapshots. */
export function hashPayload(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}
