/*
 * Vercel Speed Insights `beforeSend` (src/app/speed-insights.tsx). Browser-safe.
 *
 * The Speed Insights script reports Web Vitals with the page URL. Orbis URLs
 * can carry identifiers and user-entered values in the query string or path
 * (/plans?id=…&flow=…, /login?returnTo=…, /workspace/<id>/…). Before anything
 * leaves the browser, the URL is reduced to origin + route template (same
 * template as the browser error relay): no query string, no fragment, no
 * id-like segment. An unparsable URL drops the measurement.
 */
import { routeTemplate } from "./route-template";

export type VitalEvent = { type: "vital"; url: string; route?: string };

export function scrubVital<T extends VitalEvent>(event: T): T | null {
  let url: URL;
  try {
    url = new URL(event.url);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  return {
    ...event,
    url: `${url.origin}${routeTemplate(url.pathname)}`,
    ...(event.route ? { route: routeTemplate(event.route) } : {}),
  };
}
