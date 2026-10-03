import { AccountData } from "@/components/account/AccountData";
import { TeamSettings } from "@/components/product/TeamSettings";
import { InboxFeatureSettings } from "@/components/account/InboxFeatureSettings";
import { getRequestStore } from "@/lib/platform/request";

export const dynamic = "force-dynamic";

export default async function Page() {
  // memberships = the signed-in user's own membership of this workspace (RLS).
  // Not wrapped in try/catch: getRequestStore redirects to /login when signed out.
  const role = (await getRequestStore()).memberships[0]?.role ?? null;
  return (
    <>
      <TeamSettings />
      <InboxFeatureSettings />
      <AccountData role={role} />
    </>
  );
}
