import { describe, expect, it } from "vitest";
import { decodeBody } from "./decode-body";

const latin1 = (text: string) => Uint8Array.from(Buffer.from(text, "latin1"));
const utf8 = (text: string) => Uint8Array.from(Buffer.from(text, "utf8"));
const TEXT = "Électricité générale à Lille — devis gratuit";
const LEGACY = "Électricité générale à Lille, maître d'œuvre"; // œ exists in windows-1252, not latin1

describe("decodeBody", () => {
  it("decodes a page served as ISO-8859-1 by its header (was U+FFFD before)", () => {
    const body = `<p>${"Électricité générale à Lille"}</p>`;
    expect(decodeBody(latin1(body), "text/html; charset=ISO-8859-1")).toBe(body);
    expect(decodeBody(latin1(body), "text/html; charset=ISO-8859-1")).not.toContain("�");
  });
  it("decodes windows-1252 specials (œ, €) declared in the header", () => {
    const bytes = Uint8Array.from([...latin1("Prix en "), 0x80, ...latin1(", ma"), 0xee, ...latin1("tre d'"), 0x9c, ...latin1("uvre")]);
    expect(decodeBody(bytes, 'text/html; charset="windows-1252"')).toBe("Prix en €, maître d'œuvre");
  });
  it("reads <meta charset> when the header has none", () => {
    const body = `<html><head><meta charset="iso-8859-1"><title>${TEXT.slice(0, 28)}</title></head></html>`;
    expect(decodeBody(latin1(body), "text/html")).toBe(body);
  });
  it("reads a http-equiv Content-Type meta", () => {
    const body = `<head><meta http-equiv="Content-Type" content="text/html; charset=iso-8859-15"><p>Électricité</p>`;
    expect(decodeBody(latin1(body), "text/html")).toContain("Électricité");
  });
  it("prefers the header over the meta", () => {
    const body = `<meta charset="iso-8859-1"><p>${TEXT}</p>`;
    expect(decodeBody(utf8(body), "text/html; charset=utf-8")).toBe(body);
  });
  it("keeps UTF-8 pages unchanged, with or without a declaration", () => {
    expect(decodeBody(utf8(TEXT), "text/html; charset=utf-8")).toBe(TEXT);
    expect(decodeBody(utf8(TEXT), "text/html")).toBe(TEXT);
    expect(decodeBody(utf8(TEXT), "")).toBe(TEXT);
  });
  it("falls back to windows-1252 when nothing is declared and the bytes are not UTF-8", () => {
    const bytes = Uint8Array.from([...latin1("Électricité générale à Lille, ma"), 0xee, ...latin1("tre d'"), 0x9c, ...latin1("uvre")]);
    expect(decodeBody(bytes, "text/html")).toBe(LEGACY);
  });
  it("ignores an unknown charset label instead of failing", () => {
    expect(decodeBody(utf8(TEXT), "text/html; charset=x-klingon")).toBe(TEXT);
    expect(decodeBody(latin1(TEXT.replace("—", "-")), "text/html; charset=x-klingon")).toBe(TEXT.replace("—", "-"));
  });
  it("honours a byte-order mark over any declaration", () => {
    const bytes = Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8(TEXT)]);
    expect(decodeBody(bytes, "text/html; charset=iso-8859-1")).toBe(TEXT);
  });
  it("never lets a page switch itself to UTF-16 from a meta", () => {
    const body = `<meta charset="utf-16"><p>${TEXT}</p>`;
    expect(decodeBody(utf8(body), "text/html")).toBe(body);
  });
  it("decodes robots.txt and sitemaps by their header too", () => {
    expect(decodeBody(latin1("Disallow: /privé/"), "text/plain; charset=iso-8859-1")).toBe("Disallow: /privé/");
  });
});

describe("fetchPublicResource decodes with the declared charset", () => {
  it("returns readable text for an ISO-8859-1 page", async () => {
    const { vi } = await import("vitest");
    const { EventEmitter } = await import("node:events");
    vi.resetModules();
    vi.doMock("node:dns/promises", () => ({ lookup: async () => [{ address: "93.184.216.34", family: 4 }] }));
    vi.doMock("node:https", () => ({
      request: (_url: URL, _opts: unknown, onResponse: (res: unknown) => void) => {
        const res = Object.assign(new EventEmitter(), {
          statusCode: 200,
          headers: { "content-type": "text/html; charset=ISO-8859-1" },
          resume() {},
          destroy() {},
        });
        const req = Object.assign(new EventEmitter(), {
          end() {
            onResponse(res);
            res.emit("data", Buffer.from("<title>Électricité générale</title>", "latin1"));
            res.emit("end");
          },
        });
        return req;
      },
    }));
    try {
      const { fetchPublicResource } = await import("./company-site");
      const page = await fetchPublicResource("https://martin-elec.fr/", { signal: AbortSignal.timeout(2000) });
      expect(page.body).toBe("<title>Électricité générale</title>");
    } finally {
      vi.doUnmock("node:https");
      vi.doUnmock("node:dns/promises");
      vi.resetModules();
    }
  });
});
