import { ORBI_MIN_SIZE, orbiSources, type OrbiMood } from "@/lib/brand/orbi";
import { OrbiMark } from "./OrbiMark";
import s from "./orbi.module.css";

export type { OrbiMood };

/**
 * Orbi, the mascot. Rules: docs/design/orbi-mascot.md — one per viewport, never decoration.
 *
 * Motion follows actual UI state, never a simulated success or timer:
 * - `working`: bob + halo, only while a real operation is pending (request in flight, batch queued/running).
 * - `mood="done"`: a single pop when it mounts or the mood turns to done (keyed on mood).
 * - `float`: slow idle float, reserved for hero moments (login, 404). Never on dense screens.
 * Everything stops under prefers-reduced-motion. Always decorative: the words around it carry the meaning.
 */
export function Orbi({
  mood = "welcome",
  size = 120,
  working = false,
  float = false,
  priority = false,
  className,
}: {
  mood?: OrbiMood;
  size?: number;
  working?: boolean;
  float?: boolean;
  /** Above-the-fold hero: load eagerly. */
  priority?: boolean;
  className?: string;
}) {
  // The 3D render is unreadable this small: the flat mark carries the identity instead.
  if (size < ORBI_MIN_SIZE) return <OrbiMark size={size} className={className} />;
  const src = orbiSources(mood, size);
  const motion = working ? "working" : float ? "float" : "still";
  return (
    <span
      key={mood}
      className={className ? `${s.orbi} ${className}` : s.orbi}
      data-motion={motion}
      data-pop={mood === "done" && !working ? "" : undefined}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <picture className={s.body}>
        <source type="image/avif" srcSet={src.avif} />
        <source type="image/webp" srcSet={src.webp} />
        {/* Pre-sized AVIF/WebP derivatives (scripts/orbi-assets.mjs): next/image cannot emit <picture> sources. */}
        <img
          src={src.fallback}
          width={size}
          height={size}
          alt=""
          draggable={false}
          decoding="async"
          // Eager: derivatives weigh a few KB and Orbi appears with state changes, where lazy loading flashes.
          loading="eager"
          fetchPriority={priority ? "high" : undefined}
        />
      </picture>
    </span>
  );
}
