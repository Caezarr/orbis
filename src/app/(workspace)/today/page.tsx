import { WorkOverview } from "@/components/product/WorkOverview";
import { PlanBanner } from "@/components/billing/PlanBanner";
import { InboxToday } from "./InboxToday";
import { WeekCard } from "@/components/followups/WeekCard";
export default function Page() {
  return (
    <>
      {/* Client-side: silent unless inbox drafts are enabled (see /api/v1/billing/entitlement). */}
      <PlanBanner />
      <InboxToday />
      {/* Measured weekly summary; silent unless inbox drafts are enabled. */}
      <WeekCard />
      <WorkOverview />
    </>
  );
}
