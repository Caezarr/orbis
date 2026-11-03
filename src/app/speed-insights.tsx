"use client";

import { SpeedInsights } from "@vercel/speed-insights/next";
import { scrubVital } from "@/lib/platform/speed-insights";

/** Speed Insights with the URL reduced to a route template before sending. */
export function ScrubbedSpeedInsights() {
  return <SpeedInsights beforeSend={scrubVital} />;
}
