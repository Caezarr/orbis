import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { StoreState } from "@/lib/domain/types";
import { buildSeed } from "@/lib/store/seed";

const DATA_DIR = path.join(process.cwd(), "data");
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
  writeFileSync(DATA_FILE, JSON.stringify(memory, null, 2));
}

export function getStore(): StoreState {
  return load();
}

export function mutateStore<T>(fn: (state: StoreState) => T): T {
  const state = load();
  const result = fn(state);
  persist();
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
