"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { bannerFor, type EntitlementView } from "@/lib/billing/view";
import s from "./billing.module.css";

/** Pure render (also used by tests). */
export function PlanBannerView({ view }: { view: EntitlementView | null }) {
  const banner = bannerFor(view);
  if (!banner) return null;
  return (
    <div
      className={`${s.banner} ${banner.tone === "warning" ? s.warning : banner.tone === "blocked" ? s.blocked : ""}`}
      role={banner.tone === "blocked" ? "alert" : "status"}
    >
      <div>
        <strong>{banner.title}</strong>
        {banner.body && <p>{banner.body}</p>}
      </div>
      {banner.cta && (
        <Link href="/billing" className={s.cta}>
          {banner.cta}
        </Link>
      )}
    </div>
  );
}

/** Trial / quota banner for Today and /start. Silent when unavailable (offline, no session). */
export function PlanBanner({ refreshKey }: { refreshKey?: string | number }) {
  const [view, setView] = useState<EntitlementView | null>(null);
  useEffect(() => {
    let active = true;
    fetch("/api/v1/billing/entitlement", { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as { entitlement: EntitlementView | null }) : null))
      .then((body) => {
        if (active) setView(body?.entitlement ?? null);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [refreshKey]);
  return <PlanBannerView view={view} />;
}
