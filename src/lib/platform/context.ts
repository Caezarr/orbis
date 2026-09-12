import { AsyncLocalStorage } from "node:async_hooks";
import type { PoolClient } from "pg";
import type { Membership, StoreState } from "@/lib/domain/types";

export type WorkspaceContext = {
  tenantId: string;
  workspaceId: string;
  userId: string;
  role: Membership["role"];
  state: StoreState;
  db?: PoolClient;
  dirty?: boolean;
  readOnly?: boolean;
  closed?: boolean;
};
export const workspaceStorage = new AsyncLocalStorage<WorkspaceContext>();
export function workspaceContext() { return workspaceStorage.getStore(); }

/** Local demo is an explicit offline mode, never a production fallback. */
export function isOfflineMode() {
  return process.env.NODE_ENV !== "production" && !process.env.VERCEL &&
    process.env.ORBIS_OFFLINE === "true" && !process.env.DATABASE_URL;
}
