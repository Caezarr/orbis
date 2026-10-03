import { describe, expect, it } from "vitest";
import {
  buildArguments,
  MAILBOX_POLICY,
  MAILBOX_TOOLS,
} from "@/lib/integrations/mailbox";

describe("sent-mail reads for the company sheet (policy unchanged)", () => {
  it("lists up to 200 sent messages over up to 90 days, read-only", () => {
    expect(buildArguments("gmail", "list_sent", { windowDays: 90, maxMessages: 200 })).toMatchObject({
      query: "in:sent newer_than:90d",
      max_results: 200,
    });
    expect(buildArguments("outlook", "list_sent", { windowDays: 90, maxMessages: 200, now: new Date("2026-10-02T00:00:00Z") })).toMatchObject({
      folder: "sentitems",
      top: 200,
      sent_date_time_gt: "2026-07-04T00:00:00.000Z",
    });
    expect(() => buildArguments("gmail", "list_sent", { windowDays: 91, maxMessages: 10 })).toThrow();
    expect(() => buildArguments("gmail", "list_sent", { windowDays: 30, maxMessages: 201 })).toThrow();
    expect(() => buildArguments("gmail", "list_sent", { windowDays: 30, maxMessages: 10, cc: "x@y.z" })).toThrow();
  });
  it("inbound listing keeps its original 31-day / 50-message bound", () => {
    expect(() => buildArguments("gmail", "list_inbound", { windowDays: 90, maxMessages: 50 })).toThrow();
    expect(() => buildArguments("gmail", "list_inbound", { windowDays: 14, maxMessages: 200 })).toThrow();
  });
  it("the mailbox policy still allows a single external write: draft creation (no send, no delete)", () => {
    expect(MAILBOX_POLICY.externalWrites).toEqual(["create_reply_draft"]);
    expect(MAILBOX_POLICY.send).toBe(false);
    for (const ops of Object.values(MAILBOX_TOOLS))
      for (const slug of Object.values(ops)) expect(slug).not.toMatch(/SEND|DELETE|TRASH|MOVE/);
  });
});
