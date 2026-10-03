import { WorkOverview } from "@/components/product/WorkOverview";
import { PlanBanner } from "@/components/billing/PlanBanner";
import { frozenSurfacesEnabled } from "@/lib/product/surfaces";
import { TodayDecisions } from "./TodayDecisions";

export const metadata = { title: "Aujourd’hui · Orbis" };

export default function Page() {
  return (
    <>
      {/* Client-side: silent unless inbox drafts are enabled (see /api/v1/billing/entitlement). */}
      <PlanBanner />
      <TodayDecisions />
      {/* Old mission overview: frozen in V1, shown only when frozen surfaces are enabled. */}
      {frozenSurfacesEnabled() && <WorkOverview />}
    </>
  );
}
