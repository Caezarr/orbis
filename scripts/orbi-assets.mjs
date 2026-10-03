#!/usr/bin/env node
/**
 * Orbi mascot derivatives: public/brand/orbi/{mood}.png (1254 px originals, kept untouched)
 * → {mood}-{64,128,256,512}.{avif,webp}. Re-run after replacing an original:
 *   node scripts/orbi-assets.mjs
 * sharp is resolved through Next.js (it ships it for next/image), so no extra dependency.
 * Keep MOODS / SIZES in sync with src/lib/brand/orbi.ts.
 */
import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextPkg = realpathSync(createRequire(path.join(root, "package.json")).resolve("next/package.json"));
const sharp = createRequire(nextPkg)("sharp");

const MOODS = ["welcome", "thinking", "done", "team"];
const SIZES = [64, 128, 256, 512];
const dir = path.join(root, "public/brand/orbi");

for (const mood of MOODS) {
  const source = path.join(dir, `${mood}.png`);
  for (const size of SIZES) {
    const base = sharp(source).resize(size, size, { fit: "contain", kernel: "lanczos3" });
    const avif = path.join(dir, `${mood}-${size}.avif`);
    const webp = path.join(dir, `${mood}-${size}.webp`);
    await base.clone().avif({ quality: 62, effort: 7 }).toFile(avif);
    await base.clone().webp({ quality: 82, alphaQuality: 90, effort: 6 }).toFile(webp);
    const [a, w] = await Promise.all([stat(avif), stat(webp)]);
    console.log(`${mood}-${size}: avif ${(a.size / 1024).toFixed(1)} KB · webp ${(w.size / 1024).toFixed(1)} KB`);
  }
}
