import Image from "next/image";
import { integrations } from "@/lib/integrations/catalog";
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
  const name = integrations.find((item) => item.slug === tool)?.name ?? tool;
  const initials = name
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  // Local brand fallback needs neither a remote request nor a signup.
  return (
    <span
      role="img"
      aria-label={`${name} logo fallback`}
      style={{
        width: size,
        height: size,
        display: "inline-grid",
        placeItems: "center",
        fontSize: Math.max(10, size * 0.45),
        fontWeight: 650,
        lineHeight: 1,
      }}
    >
      {initials}
    </span>
  );
}
