import type { Metadata } from "next";
import { CompanyLanding } from "@/components/landing/CompanyLanding";

export const metadata: Metadata = {
  title: "Orbis — Install work into your company.",
  description:
    "Turn one repeating job into a bounded mission on your company. Test the result, check sources and unknowns, activate under supervision.",
};

export default function LandingPage() {
  return <CompanyLanding />;
}
