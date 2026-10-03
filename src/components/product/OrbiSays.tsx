import type { ReactNode } from "react";
import type { OrbiMood } from "@/lib/brand/orbi";
import { Orbi } from "./Orbi";
import s from "./orbi.module.css";

/**
 * Orbi speaking one short line (a guide, a question, a result). The bubble is real text;
 * the character is decorative. `live` announces changes (working → done) to screen readers.
 * Keep lines short: one sentence, two at most. Orbi says « je », the product says « Orbis ».
 */
export function OrbiSays({
  mood = "welcome",
  working = false,
  size = 64,
  live = false,
  children,
  className,
}: {
  mood?: OrbiMood;
  working?: boolean;
  size?: number;
  live?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className ? `${s.says} ${className}` : s.says}>
      <Orbi mood={mood} size={size} working={working} />
      <div className={s.bubble} role={live ? "status" : undefined} aria-live={live ? "polite" : undefined}>
        {children}
      </div>
    </div>
  );
}

/**
 * Empty or unavailable screen where Orbi has something honest to say: what will appear here,
 * and what (if anything) the user can do. Never for a loading spinner or a filtered-empty list.
 */
export function OrbiEmpty({
  mood = "welcome",
  working = false,
  title,
  children,
  actions,
  size = 112,
  headingLevel = 2,
}: {
  mood?: OrbiMood;
  working?: boolean;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  size?: number;
  headingLevel?: 1 | 2 | 3;
}) {
  const Heading = `h${headingLevel}` as const;
  return (
    <section className={s.empty}>
      <Orbi mood={mood} size={size} working={working} />
      <Heading className={s.emptyTitle}>{title}</Heading>
      {children && <div className={s.emptyBody}>{children}</div>}
      {actions && <div className={s.emptyActions}>{actions}</div>}
    </section>
  );
}
