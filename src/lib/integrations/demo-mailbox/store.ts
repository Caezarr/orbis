import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_FIXTURE, type DemoFixture, type Person } from "./fixtures";

/*
 * State of the demo mailbox: the seeded fixture messages (absolute dates),
 * connected accounts created by the fake consent flow, and the drafts Orbis
 * created. File-backed by default so the dev server, the operations worker
 * script and `pnpm demo:reset` share one mailbox; tests use memory.
 */
export type DemoProvider = "gmail" | "outlook";
export type DemoMessage = {
  key: string;
  threadKey: string;
  direction: "in" | "out";
  from: Person;
  to: Person[];
  replyTo?: string;
  subject: string;
  text: string;
  at: string;
  labels: string[];
  headers: Record<string, string>;
};
export type DemoAccount = {
  id: string;
  userId: string;
  provider: DemoProvider;
  authConfigId: string;
  status: "INITIATED" | "ACTIVE";
  callbackUrl: string;
  createdAt: string;
};
export type DemoDraft = {
  id: string;
  messageKey: string;
  provider: DemoProvider;
  accountId: string;
  threadKey: string;
  /** Message the draft replies to (Outlook createReply). */
  inReplyTo?: string;
  to: string[];
  subject: string;
  body: string;
  createdAt: string;
};
export type DemoState = {
  version: 1;
  fixture: string;
  seededAt: string;
  owner: Person;
  company: DemoFixture["company"];
  messages: DemoMessage[];
  accounts: DemoAccount[];
  drafts: DemoDraft[];
};
export type DemoStore = {
  read(): DemoState;
  /** Read-modify-write; returns the callback's result. */
  update<T>(fn: (state: DemoState) => T): T;
  reset(now?: Date): DemoState;
};

/** Paris local HH:MM on `day` days before `now`, as an ISO instant (CET/CEST). */
function parisInstant(now: Date, day: number, time: string) {
  const [h, m] = time.split(":").map(Number) as [number, number];
  const base = new Date(now.getTime() + day * 86_400_000);
  const utc = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), h, m);
  // Paris offset for that date (no Intl tz math needed for a demo: Intl gives it).
  const offset = parisOffsetMinutes(new Date(utc));
  return new Date(utc - offset * 60_000);
}
function parisOffsetMinutes(at: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    timeZoneName: "shortOffset",
  }).formatToParts(at);
  const name = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT+1";
  const match = name.match(/GMT([+-]\d+)(?::(\d+))?/);
  return match ? Number(match[1]) * 60 + Math.sign(Number(match[1])) * Number(match[2] ?? 0) : 60;
}

export function seedState(now = new Date(), fixture: DemoFixture = DEFAULT_FIXTURE): DemoState {
  const latest = now.getTime() - 5 * 60_000;
  const messages: DemoMessage[] = [];
  for (const thread of fixture.threads)
    thread.messages.forEach((m, index) => {
      const at = Math.min(parisInstant(now, m.day, m.time).getTime(), latest);
      const subject = m.subject ?? (index === 0 ? thread.subject : `Re: ${thread.subject}`);
      messages.push({
        key: `${thread.key}#${index}`,
        threadKey: thread.key,
        direction: m.dir,
        from: m.from ?? (m.dir === "in" ? thread.contact : fixture.owner),
        to: m.to ?? (m.dir === "in" ? [fixture.owner] : [thread.contact]),
        ...(m.replyTo ? { replyTo: m.replyTo } : {}),
        subject,
        text: m.text,
        at: new Date(at).toISOString(),
        labels: m.labels ?? [],
        headers: m.headers ?? {},
      });
    });
  messages.sort((a, b) => a.at.localeCompare(b.at));
  return {
    version: 1,
    fixture: fixture.id,
    seededAt: now.toISOString(),
    owner: fixture.owner,
    company: fixture.company,
    messages,
    accounts: [],
    drafts: [],
  };
}

export function memoryDemoStore(now = new Date()): DemoStore {
  let state = seedState(now);
  return {
    read: () => structuredClone(state),
    update(fn) {
      const next = structuredClone(state);
      const result = fn(next);
      state = next;
      return result;
    },
    reset(at = new Date()) {
      state = seedState(at);
      return structuredClone(state);
    },
  };
}

export function demoStateFile(env: Record<string, string | undefined> = process.env) {
  return path.resolve(env.ORBIS_DEMO_MAILBOX_FILE?.trim() || path.join(process.cwd(), ".orbis-demo", "mailbox.json"));
}

export function fileDemoStore(file = demoStateFile()): DemoStore {
  const write = (state: DemoState) => {
    mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
    writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
    renameSync(tmp, file); // atomic replace: readers never see a partial file
  };
  const read = (): DemoState => {
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as DemoState;
      if (parsed?.version === 1 && Array.isArray(parsed.messages)) return parsed;
    } catch {
      // Missing or unreadable: seed below.
    }
    const seeded = seedState();
    write(seeded);
    return seeded;
  };
  return {
    read,
    update(fn) {
      const state = read();
      const result = fn(state);
      write(state);
      return result;
    },
    reset(now = new Date()) {
      rmSync(file, { force: true });
      const seeded = seedState(now);
      write(seeded);
      return seeded;
    },
  };
}

let override: DemoStore | null = null;
/** Tests: route the fake SDK to a memory store. Pass null to restore the file store. */
export function setDemoStore(store: DemoStore | null) {
  override = store;
}
export function demoStore(): DemoStore {
  return override ?? fileDemoStore();
}

// Provider-shaped identifiers, deterministic per fixture key.
const digest = (value: string) => createHash("sha256").update(value).digest();
export const gmailMessageId = (key: string) => digest(`gmail-message:${key}`).toString("hex").slice(0, 16);
export const gmailThreadId = (threadKey: string) => digest(`gmail-thread:${threadKey}`).toString("hex").slice(0, 16);
export const outlookMessageId = (key: string) =>
  `AAMkADdlbW8${digest(`outlook-message:${key}`).toString("base64url").slice(0, 48)}`;
export const outlookConversationId = (threadKey: string) =>
  `AAQkADdlbW8${digest(`outlook-thread:${threadKey}`).toString("base64url").slice(0, 32)}`;
export const newId = (prefix: string) => `${prefix}${randomBytes(9).toString("base64url").replace(/[^A-Za-z0-9]/g, "x")}`;
