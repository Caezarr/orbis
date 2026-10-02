"use client";
import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import Link from "next/link";
import Image from "next/image";
import { useReducedMotion } from "motion/react";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { LandingCta } from "./LandingCta";
import s from "./company-landing.module.css";

const MotionContext = createContext(false);
/** Motion flag for children of VerticalShell (system preference + footer toggle). */
export const useShellMotion = () => useContext(MotionContext);

function Mark() {
  return <Image src="/brand/orbis-mark.svg" width={36} height={36} alt="" />;
}

// Only publicly reachable pages (see src/proxy.ts). /pricing is gated, so the
// pricing link points at the public landing section.
const links = [
  { href: "/for", text: "Industries" },
  { href: "/catalog", text: "Mission catalogue" },
  { href: "/#pricing", text: "Pricing" },
];

const subscribeHydration = () => () => {};

export function VerticalShell({
  ctaHref,
  children,
}: {
  ctaHref: string;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const [quiet, setQuiet] = useState(false);
  const [menu, setMenu] = useState(false);
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false,
  );
  const enabled = hydrated && reduced === false && !quiet;
  return (
    <MotionContext.Provider value={enabled}>
      <div className={s.root} data-motion={enabled}>
        <a href="#main" className={s.skip}>
          Skip to content
        </a>
        <header className={s.nav}>
          <Link href="/" className={s.brand} aria-label="Orbis home">
            <Mark />
            Orbis
          </Link>
          <nav className={s.desktopNav} aria-label="Main navigation">
            {links.map((l) => (
              <Link key={l.href} href={l.href}>
                {l.text}
              </Link>
            ))}
          </nav>
          <div className={s.navActions}>
            <Link className={s.login} href="/login">
              Login
            </Link>
            <LandingCta href={ctaHref} enabled={enabled}>
              Test a mission on my company
            </LandingCta>
            <button
              className={s.menuToggle}
              aria-label="Toggle navigation"
              aria-expanded={menu}
              onClick={() => setMenu((v) => !v)}
            >
              {menu ? <X /> : <Menu />}
            </button>
          </div>
        </header>
        {menu && (
          <nav className={s.mobileNav} aria-label="Mobile navigation">
            {[...links, { href: "/login", text: "Login" }].map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setMenu(false)}>
                {l.text}
                <ArrowUpRight size={15} />
              </Link>
            ))}
          </nav>
        )}
        <main id="main">{children}</main>
        <footer className={s.footer}>
          <div>
            <Link href="/" className={s.brand}>
              <Mark />
              Orbis
            </Link>
            <p>
              Your company. Your tools.
              <br />
              Work you review.
            </p>
          </div>
          <div>
            <span>Explore</span>
            <Link href="/for">Industries</Link>
            <Link href="/catalog">Mission catalogue</Link>
            <Link href="/#pricing">Pricing</Link>
          </div>
          <div>
            <span>Get started</span>
            <Link href="/login">Login</Link>
            <Link href={ctaHref}>Start the company audit</Link>
          </div>
          <div className={s.footerBottom}>
            <span>© {new Date().getFullYear()} Orbis</span>
            <label className={s.motionPreference}>
              Motion{" "}
              <select
                aria-label="Motion preference"
                value={quiet ? "reduced" : "system"}
                onChange={(e) => setQuiet(e.target.value === "reduced")}
              >
                <option value="system">Automatic</option>
                <option value="reduced">Reduced</option>
              </select>
            </label>
          </div>
        </footer>
      </div>
    </MotionContext.Provider>
  );
}
