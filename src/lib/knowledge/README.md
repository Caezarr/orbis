# Knowledge integration contract

Import `retrieveKnowledge` from `@/lib/knowledge` (also exported from `retrieval.ts`).

```ts
const evidence = retrieveKnowledge({
  state, // authenticated, server-resolved workspace state
  query,
  sourceIds: missionVersion.knowledgeSourceIds, // server-resolved allowlist
  limit: 8,
});
```

Returns `KnowledgeEvidence[]`: `sourceId`, `sourceName`, exact `excerpt` (up to 700 characters), `sourceVersion`, `version` (alias), `score`, `createdAt`, `origin`, and `locator` (`sourceId@version`). Scores are lexical BM25, not probabilities. Only ready, nonempty, same-tenant sources in the allowlist enter the corpus statistics. Empty selection means no results. No retained index: deleted, revoked, stale or updated sources are reflected on the next call with current state.

Optional `missionId` intersects the allowlist with that mission's active version (draft if no active version). Missing, archived, foreign missions and invalid version ownership return no results. For a runtime pinned to a specific historical version, supply that server-validated version's source IDs and omit `missionId`; the caller must validate mission/version ownership.

`POST /api/v1/knowledge-search` accepts `{ query, sourceIds, missionId?, limit? }`, returns `{ items, method: "lexical-bm25" }`, rejects extra fields including client tenant IDs, and uses `private, no-store`. POST now runs inside the platform's `withWorkspaceRequest` so `getStore()` is session scoped. A client source selection narrows workspace access; it is not authentication. The retrieval layer enforces the source/tenant ACL represented by the supplied state; no per-user ACL field exists in the current Source model. Route tests explicitly set `ORBIS_OFFLINE=true`, clear database/deployment settings and supply a same-origin header; they do not test a live Supabase/PostgreSQL session.

`resolveApprovedMemory({ state, sourceIds, missionId?, customerKey?, runId?, now? })` returns `{ items, conflicts }`. It filters approval, tenant, mission/customer/result scope and optional validity dates before detecting conflicts. `KnowledgeMemory` adds optional `validFrom`, `expiresAt`, `version`, `sourceRefs: [{ sourceId, sourceVersion }]`, and `conflictKey` without changing shared domain types. Supplied source references must all remain ready, selected and version-current. Legacy memories without structured references remain governed by approval and scope; their free-text provenance cannot establish source lineage. Persist these optional fields through the existing store when creating new memories. This module supplies primitives; existing memory approval routes/runtime consumers are not rewritten.

Conflicts are distinct bodies with the same explicit conflict key or normalized title among eligible memories. All conflicting items are excluded and their IDs reported; there is no semantic contradiction detector or silent winner selection.

The panel is integrated only in the existing Sources tab. It searches real stored excerpts, displays evidence/version/added time, invalidates displayed results when the selection or source snapshot changes, and preserves the original sources, add form, Instructions and Memory tabs. Folder/provider synchronization and Nango are not implemented or claimed.

Tests: `pnpm exec vitest run src/lib/knowledge/knowledge.test.ts`.
