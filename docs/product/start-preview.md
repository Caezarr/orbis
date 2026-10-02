# /start instant preview — level 1, "value before connection"

Status: built behind `ORBIS_START_PREVIEW=false`. No live model call has been made. Updated 2026-10-02. Concept: level 1 of `docs/strategy/18-orbi-inbox-concept.md`.

## What the visitor sees

After confirming the step-1 profile, still **anonymous**, step 1 stays open and shows a preview before the account step. The CTA "Brancher ma boîte pour de vrai" opens step 2 (account). "Modifier le profil" goes back to the review. The preview is shown once per confirmation; after a reload the visitor lands on step 2 directly.

Two modes, decided by the server (`POST /api/v1/start/preview`):

| Mode | When | Content |
|---|---|---|
| `ai` | `ORBIS_START_PREVIEW=true` **and** a model provider is configured, within limits | "Ce que vos clients vous demandent probablement": up to 10 likely questions. Each has either an exact quote from the page (verified verbatim server-side, with its source) or the marker "Orbi ne trouve pas la réponse sur votre site → il vous la demandera une seule fois". Then up to 2 simulated incoming emails and their example drafts, each labelled "Exemple simulé — pas un vrai mail". |
| `quotes` | flag off, no provider, rate limit, budget, concurrency, model or site failure | "Ce qu'Orbi peut déjà citer dans une réponse" (the quotes the owner just confirmed) + "Ce qu'Orbi ne devine pas". No questions, no drafts, nothing generated; the copy never mentions an AI analysis. When the reason is a limit or failure, one line says the detailed preview is unavailable for now. |

## Honesty rules (code, not prompt) — `src/lib/start/preview.ts`

- **Source** = the page re-read server-side through the SSRF-guarded broker reader (`readCompanySite`), or, for a description-only profile, the owner's own words. Sentences that look like instructions to a model (`injectionSignals`) are removed first: they are not company facts, cannot be quoted and cannot make an address/link "trusted". The rest is sent only inside a random `<ORBIS_DATA_…>` boundary; the anonymous name/summary never enter a system prompt.
- **Answers**: kept only if the quote (≥ 12 chars) is a verbatim substring of the source; otherwise `answer: null` → "il vous la demandera une seule fois". Questions carrying a figure absent from the source, contact data or instruction-like text are dropped.
- **Example drafts** use the inbox-replies contract unchanged: `draftPrompt` (company sources, no tone samples) → `replyDraftSchema` → `guardDraft` (unsupported amounts, emails, links, phones → `[[À CONFIRMER : …]]`, non-verbatim citations dropped). Then a stricter preview-only guard, `guardFigures`: **any** figure (delay, quantity, percentage, date) absent from the source becomes `[[À CONFIRMER : chiffre]]`, and figures inside placeholders/questions are elided.
- The simulated incoming email is model-written, stripped of contact data and amounts. Sender (`Client fictif <client.fictif@exemple.invalid>`) and recipient (`Vous (exemple)`) are constants in code, labelled fictitious. Both the incoming email and the draft carry the simulated label.

## Cost and abuse controls (anonymous model call)

| Control | Value |
|---|---|
| Same-origin | `isSameOriginMutation`, 403 otherwise |
| Body size | 16 KB max (413); profile schema-validated (strict) |
| Source size | 8,000 chars sent to the model |
| Rate limit | 3 generations / hour / client IP (site reading: 6 / 10 min) |
| Concurrency | 2 generations at once |
| Budget | estimate `ORBIS_START_PREVIEW_EST_CENTS` (default 15¢: 1 questions call + 2 drafts) reserved **before** calling, never refunded; per-IP `ORBIS_START_PREVIEW_IP_DAILY_CAP_CENTS` (default 30¢) and global `ORBIS_START_PREVIEW_DAILY_CAP_CENTS` (default 150¢), UTC day |
| Dedupe | one generation per profile hash (SHA-256 of the confirmed profile), cached 6 h (LRU 200), in-flight requests share the same promise; cache hits bypass rate limit and budget; failures are not cached |
| Timeouts | site read 15 s, questions call 20 s, each draft 25 s (drafts in parallel); route `maxDuration` 60 s |
| Tools | none; `maxRetries: 0` |

**Shared across instances since Phase 4** ([launch-hardening.md](launch-hardening.md)): the rate limits and the daily budgets are PostgreSQL counters (migration 012) behind an in-memory pre-check. The preview limiter and budget fail closed when the shared store is unreachable (quote-only view); the site-reading limiter fails open to its in-memory layer. Concurrency and the 6 h result cache remain per instance. An edge/WAF limit in front of `/api/v1/start/*` is still recommended. The budget is an estimate, not a measured provider cost.

## Event

`preview_shown` (property `ai`: true for the model preview, false for quote-only). The visitor has no workspace yet, so — like `site_analyzed` — nothing is recorded anonymously: the browser keeps a marker (`orbis:start:preview-shown`, 24 h, localStorage) and sends `preview: { ai }` with the profile to `POST /api/v1/start/profile` after account creation, which records it once per workspace (`trackOnce`). Previews shown to visitors who never create an account are not counted.

## Activation

1. Configure the model provider (`ORBIS_AI_PROVIDER`, `ORBIS_AI_MODEL`, key). Measure real cost of one preview on staging and set `ORBIS_START_PREVIEW_EST_CENTS` accordingly.
2. Add an edge rate limit on `/api/v1/start/preview`.
3. `ORBIS_START_PREVIEW=true` on staging, run a few real sites (with and without prices/contact on the page), check answers are quotes and drafts show placeholders instead of figures.
4. Then production, with small daily caps.

## Known limits

- Guards are pattern-based: an invented commitment without a figure ("nous pouvons passer demain") can survive in an example draft; the drafts are clearly labelled simulated examples and every real draft is reviewed by a human.
- Question quality is unmeasured; no live model run has been done.
- The page read is one page (the URL given), like step 1.
