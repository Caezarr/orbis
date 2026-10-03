import { describe, expect, it } from "vitest";
import type { MailMessage } from "@/lib/integrations/mailbox-normalize";
import {
  classifyOwnerMessage,
  contactOf,
  decideFollowup,
  maskEmail,
  nextCheckAt,
  nextStatus,
  observeThread,
  reconsiderable,
  type FollowupContext,
} from "./detect";
import { verifyRequest } from "./request";

const msg = (over: Partial<MailMessage>): MailMessage => ({
  provider: "gmail",
  id: "m",
  threadId: "t",
  from: { address: "claire@client.test", name: "Claire Durand" },
  replyTo: [],
  to: [],
  subject: "Devis",
  receivedAt: "2026-10-01T08:00:00.000Z",
  text: "",
  labels: [],
  headers: {},
  isDraft: false,
  fromOwner: false,
  ...over,
});
const owner = (receivedAt: string, text = "Voici notre devis : 2 400 € HT.") =>
  msg({ id: `o-${receivedAt}`, from: { address: "paul@atelier.test" }, to: ["claire@client.test"], receivedAt, text, fromOwner: true });
const customer = (receivedAt: string, text = "Bonjour, combien pour la pose ?") => msg({ id: `c-${receivedAt}`, receivedAt, text });

describe("observeThread", () => {
  it("owner wrote last: awaiting the customer; first reply measured after the request", () => {
    const obs = observeThread(
      [customer("2026-10-01T08:00:00.000Z"), owner("2026-10-01T10:30:00.000Z")],
      "claire@client.test",
      "2026-10-01T08:00:00.000Z",
    );
    expect(obs).toMatchObject({ awaitingCustomer: true, firstRepliedAt: "2026-10-01T10:30:00.000Z", lastCustomerAt: "2026-10-01T08:00:00.000Z" });
  });
  it("a customer reply after the owner ends the wait; drafts and other senders are ignored", () => {
    const obs = observeThread(
      [
        customer("2026-10-01T08:00:00.000Z"),
        owner("2026-10-01T10:00:00.000Z"),
        msg({ id: "x", from: { address: "fournisseur@x.test" }, receivedAt: "2026-10-03T08:00:00.000Z" }),
        { ...owner("2026-10-04T08:00:00.000Z"), isDraft: true },
        customer("2026-10-02T09:00:00.000Z", "Merci, je réfléchis."),
      ],
      "CLAIRE@client.test",
      null,
    );
    expect(obs.awaitingCustomer).toBe(false);
    expect(obs.lastOwnerAt).toBe("2026-10-01T10:00:00.000Z");
    expect(obs.lastCustomer?.id).toBe("c-2026-10-02T09:00:00.000Z");
  });
});

describe("classifyOwnerMessage (code first, model only when ambiguous)", () => {
  it.each([
    ["Voici notre devis pour la pose.", "quote"],
    ["Le total s'élève à 1 250 € TTC.", "quote"],
    ["Pouvez-vous m'envoyer les dimensions ?", "question"],
    ["Merci, bonne journée !", "closing"],
    ["Nous intervenons bien à Lille.", "ambiguous"],
  ])("%s → %s", (text, kind) => expect(classifyOwnerMessage(text)).toBe(kind));
  it("ignores quoted customer history", () => {
    expect(classifyOwnerMessage("Merci, c'est noté.\n\nLe 1 oct. 2026 à 10:00, Claire a écrit :\n> Quel est votre prix ?")).toBe("closing");
  });
});

const ctx = (over: Partial<FollowupContext> = {}): FollowupContext => ({
  status: "repondu",
  followupsDismissed: false,
  snoozedUntil: null,
  contactEmail: "claire@client.test",
  businessDays: 5,
  maxStages: 2,
  enabled: true,
  existing: [],
  ...over,
});
const waiting = { awaitingCustomer: true, lastOwnerAt: "2026-10-02T14:00:00.000Z" }; // Friday 16:00 Paris
describe("decideFollowup", () => {
  it("waits N business days (weekend excluded), then proposes stage 1", () => {
    expect(decideFollowup(waiting, ctx(), new Date("2026-10-08T21:00:00Z"))).toEqual({ action: "wait", dueAt: "2026-10-08T22:00:00.000Z" });
    expect(decideFollowup(waiting, ctx(), new Date("2026-10-09T06:00:00Z"))).toEqual({ action: "propose", stage: 1, dueAt: "2026-10-08T22:00:00.000Z" });
  });
  it("honors the configured delay", () => {
    expect(decideFollowup(waiting, ctx({ businessDays: 2 }), new Date("2026-10-06T23:00:00Z"))).toMatchObject({ action: "propose", stage: 1 });
  });
  it("no follow-up when the customer answered, the request is closed, dismissed or has no contact", () => {
    const now = new Date("2026-10-20T08:00:00Z");
    expect(decideFollowup({ ...waiting, awaitingCustomer: false }, ctx(), now)).toMatchObject({ action: "none", reason: "not_awaiting" });
    expect(decideFollowup(waiting, ctx({ status: "gagne" }), now)).toMatchObject({ reason: "closed" });
    expect(decideFollowup(waiting, ctx({ status: "perdu" }), now)).toMatchObject({ reason: "closed" });
    expect(decideFollowup(waiting, ctx({ followupsDismissed: true }), now)).toMatchObject({ reason: "dismissed" });
    expect(decideFollowup(waiting, ctx({ contactEmail: null }), now)).toMatchObject({ reason: "no_contact" });
    expect(decideFollowup(waiting, ctx({ enabled: false }), now)).toMatchObject({ reason: "disabled" });
  });
  it("snooze postpones a due follow-up", () => {
    expect(decideFollowup(waiting, ctx({ snoozedUntil: "2026-10-15T08:00:00.000Z" }), new Date("2026-10-12T08:00:00Z"))).toEqual({
      action: "wait",
      dueAt: "2026-10-15T08:00:00.000Z",
    });
  });
  it("idempotent: stage 1 is never proposed twice; stage 2 only after the owner sent something after the stage-1 draft", () => {
    const drafted = { stage: 1, status: "drafted", draftedAt: "2026-10-09T07:00:00.000Z", ownerMessageAt: waiting.lastOwnerAt };
    const now = new Date("2026-10-30T08:00:00Z");
    expect(decideFollowup(waiting, ctx({ existing: [drafted] }), now)).toMatchObject({ action: "none", reason: "previous_pending" });
    const sentAfter = { awaitingCustomer: true, lastOwnerAt: "2026-10-12T09:00:00.000Z" };
    expect(decideFollowup(sentAfter, ctx({ existing: [drafted] }), now)).toMatchObject({ action: "propose", stage: 2 });
  });
  it("caps at 2 stages and at the configured maximum", () => {
    const rows = [
      { stage: 1, status: "drafted", draftedAt: "2026-10-09T07:00:00.000Z", ownerMessageAt: "2026-10-02T14:00:00.000Z" },
      { stage: 2, status: "drafted", draftedAt: "2026-10-19T07:00:00.000Z", ownerMessageAt: "2026-10-12T09:00:00.000Z" },
    ];
    const later = { awaitingCustomer: true, lastOwnerAt: "2026-10-20T09:00:00.000Z" };
    expect(decideFollowup(later, ctx({ existing: rows }), new Date("2026-11-30T08:00:00Z"))).toMatchObject({ reason: "max_stages" });
    expect(decideFollowup(later, ctx({ existing: rows.slice(0, 1), maxStages: 1 }), new Date("2026-11-30T08:00:00Z"))).toMatchObject({ reason: "max_stages" });
    expect(decideFollowup(later, ctx({ existing: rows, maxStages: 9 }), new Date("2026-11-30T08:00:00Z"))).toMatchObject({ reason: "max_stages" });
  });
  it("a failed or not-needed stage without draft can be reconsidered (newer owner message for not_needed)", () => {
    const failed = { stage: 1, status: "failed", draftedAt: null, ownerMessageAt: waiting.lastOwnerAt, draftState: "none" };
    expect(reconsiderable(failed, waiting.lastOwnerAt)).toBe(true);
    expect(decideFollowup(waiting, ctx({ existing: [failed] }), new Date("2026-10-12T08:00:00Z"))).toMatchObject({ action: "propose", stage: 1 });
    const notNeeded = { ...failed, status: "not_needed" };
    expect(reconsiderable(notNeeded, waiting.lastOwnerAt)).toBe(false);
    expect(reconsiderable(notNeeded, "2026-10-05T08:00:00.000Z")).toBe(true);
    expect(reconsiderable({ ...failed, draftState: "uncertain" }, waiting.lastOwnerAt)).toBe(false);
  });
});

describe("pipeline status transitions", () => {
  it("nouveau → répondu → relancé, monotonic", () => {
    expect(nextStatus("nouveau", { firstRepliedAt: null, relanceAt: null })).toBe("nouveau");
    expect(nextStatus("nouveau", { firstRepliedAt: "x", relanceAt: null })).toBe("repondu");
    expect(nextStatus("repondu", { firstRepliedAt: "x", relanceAt: "y" })).toBe("relance");
    expect(nextStatus("relance", { firstRepliedAt: "x", relanceAt: null })).toBe("relance");
  });
  it("gagné / perdu are manual and never overwritten by observation", () => {
    expect(nextStatus("gagne", { firstRepliedAt: "x", relanceAt: "y" })).toBe("gagne");
    expect(nextStatus("perdu", { firstRepliedAt: null, relanceAt: null })).toBe("perdu");
  });
  it("schedules the next thread read and stops after closing or 60 days", () => {
    const now = new Date("2026-10-05T08:00:00Z");
    const item = { status: "repondu" as const, createdAt: "2026-10-01T08:00:00.000Z", firstRepliedAt: "x" };
    expect(nextCheckAt(item, { action: "wait", dueAt: "2026-10-05T12:00:00.000Z" }, now)).toBe("2026-10-05T12:00:00.000Z");
    expect(nextCheckAt(item, { action: "none", reason: "x" }, now)).toBe("2026-10-06T08:00:00.000Z");
    expect(nextCheckAt({ ...item, firstRepliedAt: null, status: "nouveau" }, { action: "none", reason: "x" }, now)).toBe("2026-10-05T14:00:00.000Z");
    expect(nextCheckAt({ ...item, status: "gagne" }, { action: "none", reason: "x" }, now)).toBeNull();
    expect(nextCheckAt({ ...item, createdAt: "2026-07-01T00:00:00.000Z" }, { action: "none", reason: "x" }, now)).toBeNull();
  });
});

describe("minimal contact data", () => {
  it("keeps display name, address and domain only; masks for logs", () => {
    expect(contactOf(msg({ from: { address: "Claire@Client.TEST", name: " Claire\nDurand <x> " } }))).toEqual({
      name: "Claire Durand x",
      email: "claire@client.test",
      domain: "client.test",
    });
    expect(contactOf(msg({ from: null }))).toEqual({ name: null, email: null, domain: null });
    expect(maskEmail("claire@client.test")).toBe("c***@client.test");
  });
});

describe("request line: quote verification (no invented values)", () => {
  const email = "Bonjour,\nNous souhaitons faire poser 40 m² de parquet chêne dans le séjour.\nNotre budget est de 3 000 € maximum, idéalement avant fin novembre.\nCordialement";
  it("keeps the need, budget and deadline only when their quotes are verbatim", () => {
    const v = verifyRequest(
      {
        need: "Pose de 40 m² de parquet chêne (séjour)",
        needQuote: "faire poser 40 m² de parquet chêne dans le séjour",
        budgetQuote: "budget est de 3 000 € maximum",
        deadlineQuote: "avant fin novembre",
      },
      email,
    );
    expect(v).toMatchObject({ state: "done", need: "Pose de 40 m² de parquet chêne (séjour)", budget: "budget est de 3 000 € maximum", deadline: "avant fin novembre" });
  });
  it("drops a paraphrased or invented budget / deadline", () => {
    const v = verifyRequest(
      { need: "Pose de parquet", needQuote: "poser 40 m² de parquet", budgetQuote: "environ 3000 euros", deadlineQuote: "sous 2 semaines" },
      email,
    );
    expect(v.budget).toBeNull();
    expect(v.deadline).toBeNull();
    expect(v.rejected).toEqual(["budget_quote", "deadline_quote"]);
  });
  it("a budget quote without an amount or a deadline quote without a date word is rejected", () => {
    const v = verifyRequest({ need: "Pose de parquet", needQuote: "poser 40 m² de parquet", budgetQuote: "Notre budget", deadlineQuote: "Cordialement" }, email);
    expect([v.budget, v.deadline]).toEqual([null, null]);
  });
  it("no verified quote → no summary (state unverified)", () => {
    expect(verifyRequest({ need: "Rénovation complète", needQuote: "rénover toute la maison", budgetQuote: null, deadlineQuote: null }, email)).toMatchObject({
      state: "unverified",
      need: null,
    });
    // Quote verbatim but the summary is unrelated to it.
    expect(verifyRequest({ need: "Installation de cuisine", needQuote: "poser 40 m² de parquet", budgetQuote: null, deadlineQuote: null }, email).need).toBeNull();
  });
});
