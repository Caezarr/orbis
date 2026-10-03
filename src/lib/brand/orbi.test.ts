import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ORBI_MOODS, ORBI_SIZES, orbiAssetWidth, orbiSources } from "./orbi";

const publicDir = path.resolve(__dirname, "../../../public");

describe("orbi assets", () => {
  it("picks the smallest derivative that covers the rendered size", () => {
    expect(orbiAssetWidth(48)).toBe(64);
    expect(orbiAssetWidth(64)).toBe(64);
    expect(orbiAssetWidth(65)).toBe(128);
    expect(orbiAssetWidth(2000)).toBe(512);
  });

  it("serves 1x and 2x sources per format", () => {
    expect(orbiSources("done", 56)).toEqual({
      avif: "/brand/orbi/done-64.avif 1x, /brand/orbi/done-128.avif 2x",
      webp: "/brand/orbi/done-64.webp 1x, /brand/orbi/done-128.webp 2x",
      fallback: "/brand/orbi/done-64.webp",
    });
    // Capped at the largest derivative: no duplicate descriptor.
    expect(orbiSources("team", 400).webp).toBe("/brand/orbi/team-512.webp");
  });

  it("has every generated derivative on disk, small, next to its untouched original", () => {
    for (const mood of ORBI_MOODS) {
      expect(existsSync(path.join(publicDir, `brand/orbi/${mood}.png`))).toBe(true);
      for (const size of ORBI_SIZES)
        for (const ext of ["avif", "webp"]) {
          const file = path.join(publicDir, `brand/orbi/${mood}-${size}.${ext}`);
          expect(existsSync(file), file).toBe(true);
          expect(statSync(file).size).toBeLessThan(64 * 1024);
        }
    }
    expect(existsSync(path.join(publicDir, "brand/orbi/orbi-mark.svg"))).toBe(true);
  });
});
