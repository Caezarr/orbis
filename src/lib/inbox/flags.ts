/** Feature flag: inbox reply drafts stay off unless explicitly enabled. */
export function inboxDraftsEnabled() {
  return process.env.ORBIS_INBOX_DRAFTS_ENABLED === "true";
}
