import Link from "next/link";
import { OrbiEmpty } from "@/components/product/OrbiSays";
import s from "./empty.module.css";

/**
 * One empty / unavailable state for the wedge pages: what is happening, and the
 * exact next step. Rendered by the mascot system (OrbiEmpty), so every empty state looks the same.
 */
export function EmptyState({
  title,
  children,
  action,
  secondary,
  mood = "welcome",
  headingLevel = 2,
}: {
  title: string;
  children?: React.ReactNode;
  action?: { href: string; label: string };
  secondary?: { href: string; label: string };
  mood?: "welcome" | "thinking" | "done" | "team";
  headingLevel?: 1 | 2;
}) {
  return (
    <OrbiEmpty
      title={title}
      mood={mood}
      size={88}
      headingLevel={headingLevel}
      actions={
        action || secondary ? (
          <>
            {action && (
              <Link href={action.href} className={s.primary}>
                {action.label}
              </Link>
            )}
            {secondary && (
              <Link href={secondary.href} className={s.secondary}>
                {secondary.label}
              </Link>
            )}
          </>
        ) : undefined
      }
    >
      {children}
    </OrbiEmpty>
  );
}

/** The wedge APIs answer 503 when inbox drafts are off on this deployment (or offline). */
export function NotOnThisDeployment({ page, headingLevel = 1 }: { page: string; headingLevel?: 1 | 2 }) {
  return (
    <EmptyState
      headingLevel={headingLevel}
      title={page}
      mood="thinking"
      action={{ href: "/start", label: "Reprendre la mise en route" }}
    >
      <p>
        Cette page se remplit quand Orbi prépare des brouillons dans votre boîte mail. Ce service n’est pas encore
        activé sur ce déploiement : rien n’est perdu, tout apparaîtra ici dès son activation.
      </p>
    </EmptyState>
  );
}
