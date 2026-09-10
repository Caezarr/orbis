import type { Metadata } from "next";
import { CompanyLanding } from "@/components/landing/CompanyLanding";

export const metadata: Metadata = {
  title: "Orbis — Your company. Your AI team.",
  description:
    "Turn your business context into focused AI missions. Choose the work, bring your tools, review the results, and build your company’s memory.",
};

export default function LandingPage() {
  return <CompanyLanding />;
}
