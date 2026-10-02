import { WorkOverview } from "@/components/product/WorkOverview";
import { PlanBanner } from "@/components/billing/PlanBanner";
import { InboxToday } from "./InboxToday";
export default function Page() {
  return (
    <>
      {/* Client-side: silent unless inbox drafts are enabled (see /api/v1/billing/entitlement). */}
      <PlanBanner />
      <InboxToday />
      <WorkOverview />
    </>
  );
}
