import { describe, expect, it } from "vitest";
import { normalizeGmailMessages, parseAddress } from "./mailbox-normalize";

describe("parseAddress", () => {
  it("keeps ordinary forms", () => {
    expect(parseAddress("jean@x.fr")).toEqual({ address: "jean@x.fr" });
    expect(parseAddress("Jean <Jean@X.fr>")).toEqual({ address: "jean@x.fr", name: "Jean" });
    expect(parseAddress('"Dupont, Jean" <jean@x.fr>')).toEqual({ address: "jean@x.fr", name: "Dupont, Jean" });
    expect(parseAddress('"jean@x.fr" <jean@x.fr>')).toEqual({ address: "jean@x.fr", name: "jean@x.fr" });
  });
  it("takes the angle-addr that ends the value, never an address in the display name", () => {
    expect(parseAddress("boss@client.fr <attacker@evil.test>")?.address).toBe("attacker@evil.test");
    expect(parseAddress('"boss@client.fr" <attacker@evil.test>')?.address).toBe("attacker@evil.test");
  });
  it("refuses ambiguous values (several angle-addrs, trailing text)", () => {
    expect(parseAddress('"<boss@client.fr>" <attacker@evil.test>')).toBeNull();
    expect(parseAddress("Support <boss@client.fr> via X <attacker@evil.test>")).toBeNull();
    expect(parseAddress("<boss@client.fr> <attacker@evil.test>")).toBeNull();
    expect(parseAddress("Jean <boss@client.fr> attacker@evil.test")).toBeNull();
    expect(parseAddress("boss@client.fr attacker@evil.test")).toBeNull();
  });
});

describe("normalizeGmailMessages sender", () => {
  const base = { messageId: "m1", threadId: "t1", messageText: "Bonjour", labelIds: ["INBOX"] };
  it("uses the real sender address", () => {
    const [m] = normalizeGmailMessages({ messages: [{ ...base, sender: '"boss@client.fr" <attacker@evil.test>' }] });
    expect(m.from?.address).toBe("attacker@evil.test");
  });
  it("has no sender when the From is ambiguous", () => {
    const [m] = normalizeGmailMessages({ messages: [{ ...base, sender: "Support <boss@client.fr> via X <attacker@evil.test>" }] });
    expect(m.from).toBeNull();
  });
  it("reads the Reply-To address, not its display name", () => {
    const [m] = normalizeGmailMessages({
      messages: [{ ...base, sender: "c@x.fr", payload: { headers: [{ name: "Reply-To", value: '"c@x.fr" <other@evil.test>' }] } }],
    });
    expect(m.replyTo).toEqual(["other@evil.test"]);
  });
});
