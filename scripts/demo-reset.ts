import { isProductionRuntime } from "../src/lib/integrations/demo-mailbox/guard";
import { demoStateFile, fileDemoStore } from "../src/lib/integrations/demo-mailbox/store";

/*
 * pnpm demo:reset — re-seed the local demo mailbox: fixture mail dated relative
 * to now, no connected account, no drafts. Orbis's own database rows (batches,
 * drafts, pipeline) are NOT touched: use a fresh workspace or reset the local
 * stack for a clean run. Refused on production runtimes.
 */
if (isProductionRuntime()) {
  console.error("demo:reset is a local development command and is refused in production.");
  process.exit(1);
}
const file = demoStateFile();
const state = fileDemoStore(file).reset();
const inbound = state.messages.filter((m) => m.direction === "in").length;
console.log(
  `Demo mailbox reset: ${inbound} received, ${state.messages.length - inbound} sent, 0 drafts, no connected account.\n${file}`,
);
if (process.env.ORBIS_DEMO_MAILBOX !== "true")
  console.log("Reminder: set ORBIS_DEMO_MAILBOX=true in .env.local so the app uses it.");
