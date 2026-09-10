"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { GlassLens } from "./Optics";
import c from "./landing-cta.module.css";
import type { ReactNode, ButtonHTMLAttributes } from "react";

type Props = {
  children: ReactNode;
  enabled?: boolean;
  href?: string;
  className?: string;
  type?: ButtonHTMLAttributes<HTMLButtonElement>["type"];
  disabled?: boolean;
  onClick?: () => void;
  variant?: "primary" | "light";
  "data-cta"?: string;
};

export function LandingCta({
  children,
  enabled = true,
  href,
  className = "",
  type = "button",
  disabled = false,
  onClick,
  variant = "primary",
  "data-cta": dataCta,
}: Props) {
  const body = (
    <>
      <span className={c.surface}>
        <GlassLens enabled={enabled && !disabled} />
      </span>
      <span className={c.shine} />
      <span className={c.label}>{children}</span>
      <ArrowUpRight size={16} />
    </>
  );
  const classNames = `${c.cta} ${className}`.trim();

  if (href) {
    return (
      <Link
        href={href}
        className={classNames}
        data-primary="true"
        data-variant={variant}
        data-cta={dataCta}
      >
        {body}
      </Link>
    );
  }

  return (
    <button
      type={type}
      className={classNames}
      data-primary="true"
      data-variant={variant}
      data-cta={dataCta}
      disabled={disabled}
      onClick={onClick}
    >
      {body}
    </button>
  );
}
