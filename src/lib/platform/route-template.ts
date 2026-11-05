/*
 * Browser-safe (no Node.js import): used by the browser error relay
 * (client-errors.ts, server side) and by the Speed Insights scrubber
 * (speed-insights.ts, browser side).
 */

const SLUG = /^[a-z][a-z-]{0,39}$/;
const ROUTE_GROUP = /^\([a-z-]{1,40}\)$/;

/** "/workspace/7f3c…/inbox?x=1" → "/workspace/[id]/inbox". At most 5 segments. */
export function routeTemplate(path: string) {
  const clean = path.split(/[?#]/)[0];
  const segments = clean.split("/").filter(Boolean).slice(0, 5);
  return "/" + segments.map((segment) => (SLUG.test(segment) || ROUTE_GROUP.test(segment) ? segment : "[id]")).join("/");
}
