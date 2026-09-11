"use client";
import { LiquidMark } from "./Optics";

export const TOOL_LOGO: Record<string, { src: string; name: string }> = {
  airbnb: { src: "airbnb", name: "Airbnb" },
  gmail: { src: "gmail", name: "Gmail" },
  whatsapp: { src: "whatsapp", name: "WhatsApp" },
  "google calendar": { src: "googlecalendar", name: "Calendar" },
  googlecalendar: { src: "googlecalendar", name: "Calendar" },
  notion: { src: "notion", name: "Notion" },
  "google docs": { src: "googledocs", name: "Docs" },
  googledocs: { src: "googledocs", name: "Docs" },
  "google sheets": { src: "googlesheets", name: "Sheets" },
  googlesheets: { src: "googlesheets", name: "Sheets" },
  sheets: { src: "googlesheets", name: "Sheets" },
  chrome: { src: "googlechrome", name: "Chrome" },
  googlechrome: { src: "googlechrome", name: "Chrome" },
  drive: { src: "googledrive", name: "Drive" },
  "google drive": { src: "googledrive", name: "Drive" },
  googledrive: { src: "googledrive", name: "Drive" },
  outlook: { src: "microsoftoutlook", name: "Outlook" },
  "microsoft outlook": { src: "microsoftoutlook", name: "Outlook" },
  microsoftoutlook: { src: "microsoftoutlook", name: "Outlook" },
  hubspot: { src: "hubspot", name: "HubSpot" },
  salesforce: { src: "salesforce", name: "Salesforce" },
  slack: { src: "slack", name: "Slack" },
};

export const HUB_TOOLGRAPH = [
  "Airbnb",
  "Gmail",
  "WhatsApp",
  "Google Calendar",
  "Notion",
  "Google Docs",
];

export function resolveTool(raw: string): { src: string | null; name: string } {
  const hit = TOOL_LOGO[raw.trim().toLowerCase()];
  return hit || { src: null, name: raw.trim() };
}

export function buildToolsOrdered(
  rawTools: string[],
  isJobPage: boolean
): Array<{ src: string; name: string }> {
  const list = [...rawTools];
  if (isJobPage) {
    for (const t of HUB_TOOLGRAPH) if (!list.includes(t)) list.push(t);
  }
  const seen = new Set<string>();
  const out: Array<{ src: string; name: string }> = [];
  for (const raw of list) {
    const t = resolveTool(raw);
    if (!t.src || seen.has(t.src)) continue;
    seen.add(t.src);
    out.push({ src: t.src, name: t.name });
    if (out.length >= 6) break;
  }
  return out;
}

export function VerticalToolGraph({
  tools,
  enabled,
  isJobPage,
  jobLabel,
  sectionClassName,
}: {
  tools: Array<{ src: string; name: string }>;
  enabled: boolean;
  isJobPage: boolean;
  jobLabel?: string;
  sectionClassName?: string;
}) {
  if (tools.length === 0) return null;
  return (
    <section className={sectionClassName} style={{ paddingTop: 24, paddingBottom: 24 }}>
      <div style={{ textAlign: "center", marginBottom: 14 }}>
        <h2 style={{ margin: "0 0 8px" }}>Your tools. Working together.</h2>
        <p style={{ margin: 0, color: "#576781", fontSize: 14 }}>
          {isJobPage
            ? `Homepage-style marks for ${jobLabel || "this mission"} — same ToolGraph as the hub pack.`
            : "Homepage-style marks for the tools this pack uses."}{" "}
          Each connector still needs verified access.
        </p>
      </div>
      <div
        data-toolgraph={isJobPage ? "job" : "hub"}
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 28,
          justifyContent: "center",
          alignItems: "flex-end",
        }}
      >
        {tools.map((tool) => (
          <div
            key={tool.src}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div style={{ position: "relative", width: 96, height: 96 }}>
              {/* Visible mark — LiquidMark mask can blank some SVGs */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/brand/tools/${tool.src}.svg`}
                alt=""
                width={96}
                height={96}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                }}
              />
              <div style={{ position: "absolute", inset: 0, opacity: 0.85 }}>
                <LiquidMark
                  enabled={enabled}
                  running={enabled}
                  src={`/brand/tools/${tool.src}.svg`}
                  size={96}
                />
              </div>
            </div>
            <small style={{ fontSize: 12, color: "#65748d", fontWeight: 500 }}>
              {tool.name}
            </small>
          </div>
        ))}
      </div>
    </section>
  );
}
