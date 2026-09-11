import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import type { StoreState } from "@/lib/domain/types";
import { buildSeed } from "@/lib/store/seed";

// Serverless filesystems are read-only outside the temp dir, so writes there
// go to /tmp (ephemeral per instance; state falls back to the seed on cold start).
const DEFAULT_DATA_DIR = process.env.VERCEL
  ? path.join(tmpdir(), "orbis")
  : path.join(process.cwd(), "data");
const DATA_DIR = process.env.ORBIS_DATA_DIR || DEFAULT_DATA_DIR;
const DATA_FILE = path.join(DATA_DIR, "state.json");

let memory: StoreState | null = null;

function hydrateById<T extends { id: string }>(
  loaded: T[] | undefined,
  fresh: T[],
  replaceWhen?: (item: T) => boolean,
): T[] {
  const byId = new Map(fresh.map((item) => [item.id, item]));
  const current = loaded ?? [];
  const seen = new Set(current.map((item) => item.id));
  const merged = current.map((item) => {
    if (replaceWhen?.(item)) return byId.get(item.id) ?? item;
    return item;
  });
  for (const item of fresh) {
    if (!seen.has(item.id)) merged.push(item);
  }
  return merged;
}

function load(): StoreState {
  if (memory) return memory;
  if (existsSync(DATA_FILE)) {
    const loaded = JSON.parse(readFileSync(DATA_FILE, "utf8")) as StoreState;
    const fresh = buildSeed();
    memory = {
      ...fresh,
      ...loaded,
      packages: fresh.packages,
      signals: loaded.signals ?? fresh.signals,
      copilot: loaded.copilot ?? fresh.copilot,
      impact: loaded.impact ?? fresh.impact,
      runs: hydrateById(loaded.runs, fresh.runs, (run) => !run.steps?.length),
      artifacts: hydrateById(loaded.artifacts, fresh.artifacts),
      evaluations: hydrateById(loaded.evaluations, fresh.evaluations),
    };
    return memory;
  }
  memory = buildSeed();
  persist();
  return memory;
}

function persist() {
  if (!memory) return;
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const temporary = `${DATA_FILE}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(memory, null, 2), { mode: 0o600 });
  renameSync(temporary, DATA_FILE);
}

export function getStore(): StoreState {
  return load();
}

/** Expire interrupted local runs. A durable worker will own this in production. */
export function reconcileStaleRuns() {
  const cutoff = Date.now() - 180000;
  const stale = (run: StoreState["runs"][number]) =>
    run.engine === "agent-v1" &&
    run.state === "running" &&
    Date.parse(run.createdAt) < cutoff;
  if (!load().runs.some(stale)) return;
  mutateStore((state) => {
    for (const run of state.runs.filter(stale)) {
      run.state = "failed";
      run.completedAt = new Date().toISOString();
      run.error =
        "The local worker was interrupted or exceeded its deadline. Provider billing may still apply. Start a new run.";
      for (const step of run.steps.filter((s) => s.status === "running")) {
        step.status = "failed";
        step.detail = run.error;
        step.endedAt = run.completedAt;
      }
    }
  });
}

export function mutateStore<T>(fn: (state: StoreState) => T): T {
  const previous = load();
  const state = structuredClone(previous);
  const result = fn(state);
  memory = state;
  try {
    persist();
  } catch (error) {
    memory = previous;
    throw error;
  }
  return result;
}

export function resetStore() {
  memory = buildSeed();
  persist();
  return memory;
}

export function tenantOrThrow(state: StoreState, tenantId: string) {
  if (state.workspace.tenantId !== tenantId) {
    throw new Error("Workspace not found");
  }
  return state;
}
