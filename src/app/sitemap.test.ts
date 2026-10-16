import { afterEach, describe, expect, it, vi } from "vitest";
import sitemap from "./sitemap";
import { frozenRedirect } from "@/lib/product/surfaces";
import { SITE_URL } from "@/lib/site";

const paths = () => sitemap().map((e) => e.url.slice(SITE_URL.length) || "/");

describe("sitemap", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("lists only pages that do not redirect in the focused V1 product", () => {
    vi.stubEnv("ORBIS_FROZEN_SURFACES_ENABLED", "");
    expect(paths()).toEqual(["/", "/start"]);
    for (const path of paths()) expect(frozenRedirect(path, false)).toBeNull();
  });

  it("lists the catalogue and industry pages again when frozen surfaces are enabled", () => {
    vi.stubEnv("ORBIS_FROZEN_SURFACES_ENABLED", "true");
    const all = paths();
    expect(all).toContain("/catalog");
    expect(all).toContain("/for");
    expect(all).toContain("/for/airbnb-hosts/guest-messaging");
  });
});
