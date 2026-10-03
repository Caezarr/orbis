import s from "./orbi.module.css";

/**
 * Flat Orbi mark for ≤ 24 px spots (nav, chips, draft attribution). Same drawing as
 * public/brand/orbi/orbi-mark.svg. `mono` follows currentColor (nav icons, dense rows).
 * Decorative by default; pass `title` only when the mark is the sole label.
 */
export function OrbiMark({
  size = 16,
  mono = false,
  title,
  className,
}: {
  size?: number;
  mono?: boolean;
  title?: string;
  className?: string;
}) {
  const ring = mono ? "currentColor" : "#8fb0ff";
  const head = mono ? "currentColor" : "#305ee8";
  const visor = mono ? "var(--orbi-mark-visor, #fff)" : "#eef3ff";
  const eyes = mono ? "currentColor" : "#182d5b";
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      className={className ? `${s.mark} ${className}` : s.mark}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <ellipse cx="12" cy="13" rx="10.6" ry="3.5" transform="rotate(-18 12 13)" stroke={ring} strokeWidth="1.5" opacity={mono ? 0.55 : 1} />
      <circle cx="12" cy="11.6" r="7.4" fill={head} />
      <ellipse cx="12" cy="12.4" rx="5.2" ry="4.3" fill={visor} />
      <ellipse cx="9.9" cy="12.3" rx="1.05" ry="1.4" fill={eyes} />
      <ellipse cx="14.1" cy="12.3" rx="1.05" ry="1.4" fill={eyes} />
      <path d="M1.92 16.28A10.6 3.5 -18 0 0 22.08 9.72" stroke={ring} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="3" cy="17.2" r="1.7" fill={head} />
    </svg>
  );
}

/** « Préparé par Orbi » attribution: the mark, never the full mascot (it repeats on every draft). */
export function OrbiChip({ children = "Préparé par Orbi" }: { children?: React.ReactNode }) {
  return (
    <span className={s.chip}>
      <OrbiMark size={14} />
      {children}
    </span>
  );
}
