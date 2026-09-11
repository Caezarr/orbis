import Image from "next/image";
import { CalendarDays } from "lucide-react";
const assets: Record<string, string> = {
  googlecalendar: "googlecalendar",
  gmail: "gmail",
  outlook: "microsoftoutlook",
  googledrive: "googledrive",
  notion: "notion",
  slack: "slack",
  hubspot: "hubspot",
  salesforce: "salesforce",
};
export function ToolLogo({ tool, size = 26 }: { tool: string; size?: number }) {
  const asset = assets[tool];
  if (asset)
    return (
      <Image
        src={`/brand/tools/${asset}.svg`}
        alt=""
        width={size}
        height={size}
        style={{ objectFit: "contain", flexShrink: 0 }}
      />
    );
  return <CalendarDays size={size} aria-hidden="true" />;
}
