import { redirect } from "next/navigation";

/** V1: one plans page. Prices come from Stripe (see /billing). */
export default function Page() {
  redirect("/billing");
}
