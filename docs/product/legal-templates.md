# Legal page templates (French)

> **These pages are templates, not legal advice. A lawyer must review them before launch.**
> **They describe the data flows as implemented today. Any change to a data flow (new provider, new stored field, new retention period, new OAuth scope, sending capability) must update these pages in the same PR.**

Public pages under `/legal` (layout: `src/app/legal/layout.tsx`, with a visible "Modèle à faire relire par un avocat" banner). Placeholders render as highlighted `<mark>[[À COMPLÉTER : …]]</mark>` via `src/components/legal/Todo.tsx`. Reusable link row: `src/components/legal/LegalLinks.tsx` (used in the workspace shell sidebar, mobile footer of workspace pages, and the billing page).

| Page | Covers |
| --- | --- |
| `/legal/cgu` | CGU + CGV of the subscription: service scope (read + drafts, never sends/forwards/deletes), user must review every draft, account, acceptable use, free trial (length/quota shown on the Abonnement page), Essentiel/Équipe plans with Stripe prices, Stripe portal cancellation at period end, account deletion (immediate cancellation, no automatic pro-rata refund), liability, governing law. |
| `/legal/confidentialite` | GDPR policy: Orbis as processor (mailbox content) vs controller (account, billing, security, analytics), data inventory, purposes and legal bases, AI providers, retention table, subprocessors and non-EU transfers, rights (online export/deletion, « Effacer le contact », CNIL), security, cookies/local storage. |
| `/legal/sous-traitants` | Subprocessor table: Supabase, Vercel, OpenAI / Anthropic (per `ORBIS_AI_PROVIDER`), Composio, Stripe, PostHog (optional), Sentry (optional). |
| `/legal/mentions` | Publisher, registration, publication director, host (Vercel Inc.), contact. |

## Placeholders to fill

- Date of last update (all 4 pages)
- Publisher: company name, legal form, share capital, SIREN, RCS, VAT number, registered address
- Publication director
- Contact email; DPO / personal-data contact email
- Host: Vercel Inc. postal address and contact
- Whether consumers (B2C) may subscribe — if yes: withdrawal right + médiateur de la consommation (current target is B2B)
- Plan prices (HT/TTC) and billing period
- Refund policy (account deletion)
- DPA reference/annex (processor agreement)
- SLA, if any
- Liability cap and exclusions
- Notification delay for changes to the terms and to the subprocessor list
- Governing law and competent court
- Legal basis for PostHog (legitimate interest vs consent) and whether it sets browser cookies
- Security measures to complete (encryption at rest, internal access control, breach notification procedure)
- Supabase backup retention period
- Region / location for each provider (Supabase — EU intended, Vercel functions, OpenAI, Anthropic, Composio, Stripe, PostHog, Sentry)
- Safeguards per provider (DPA, adequacy decision / EU-US DPF, SCCs)
- Which AI provider is active (OpenAI / Anthropic)
- AI provider zero-data-retention option: verify / enable
