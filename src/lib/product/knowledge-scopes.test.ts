import { describe, it, expect } from "vitest";
import { scopeSchema } from "./knowledge-scopes";
import {
  publicAddress,
  publicWebsite,
  extractCompany,
} from "../runtime/company-site";
const input = {
  missionId: "mission-1",
  provider: "sharepoint",
  kind: "folder",
  url: "https://acme.sharepoint.com/sites/Sales/Documents",
  recursive: false,
  instructions: "",
};
describe("Knowledge boundaries", () => {
  it("accepts precise SharePoint scopes", () =>
    expect(scopeSchema.safeParse(input).success).toBe(true));
  it.each([
    "https://sharepoint.com.attacker.com/sites/a",
    "http://acme.sharepoint.com/sites/a",
    "https://acme.sharepoint.com/",
    "https://u:p@acme.sharepoint.com/sites/a",
  ])("rejects unsafe scope %s", (url) =>
    expect(scopeSchema.safeParse({ ...input, url }).success).toBe(false),
  );
  it("rejects incompatible resource types", () =>
    expect(scopeSchema.safeParse({ ...input, kind: "database" }).success).toBe(
      false,
    ));
});
describe("Public website reader", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
  ])("rejects private address %s", (address) =>
    expect(publicAddress(address)).toBe(false),
  );
  it("allows public addresses", () =>
    expect(publicAddress("1.1.1.1")).toBe(true));
  it("rejects insecure URLs", () =>
    expect(() => publicWebsite("http://example.com")).toThrow());
  it("extracts content without scripts", () => {
    const result = extractCompany(
      "<title>ACME</title><body><main>Business expertise<script>secret()</script></main></body>",
      "https://example.com",
    );
    expect(result.title).toBe("ACME");
    expect(result.excerpt).toBe("Business expertise");
  });
});
