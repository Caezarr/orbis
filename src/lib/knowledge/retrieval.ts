import type { Citation, Source, StoreState } from "@/lib/domain/types";

export type KnowledgeEvidence = Citation & {
  sourceVersion: string;
  version: string;
  score: number;
  createdAt: string;
  origin: string;
};

/** State must come from the server's authenticated workspace context.
 * sourceIds is the server-resolved allowlist (empty means no access).
 * Pass missionId to intersect that list with the current mission version.
 */
export type RetrievalInput = {
  state: StoreState;
  query: string;
  sourceIds: readonly string[];
  limit?: number;
  missionId?: string;
  versionId?: string;
};

export function accessibleSources({
  state,
  sourceIds,
  missionId,
  versionId,
}: Omit<RetrievalInput, "query">): Source[] {
  const tenantId = state.workspace.tenantId;
  let allowed = new Set(sourceIds);
  if (missionId !== undefined) {
    const mission = state.missions.find(
      (m) =>
        m.id === missionId && m.tenantId === tenantId && m.state !== "archived",
    );
    if (!mission) return [];
    const version = state.missionVersions.find(
      (v) =>
        v.id ===
          (versionId ?? mission.activeVersionId ?? mission.draftVersionId) &&
        v.missionId === mission.id &&
        v.tenantId === tenantId,
    );
    if (!version) return [];
    allowed = new Set(
      version.knowledgeSourceIds.filter((id) => allowed.has(id)),
    );
  }
  return state.sources.filter(
    (s) =>
      s.tenantId === tenantId &&
      allowed.has(s.id) &&
      s.status === "ready" &&
      (!s.remote || Date.now() - Date.parse(s.remote.verifiedAt) < 3600000) &&
      s.excerpt.trim().length > 0,
  );
}

function tokens(text: string): string[] {
  return (
    text
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

function snippet(text: string, queryTerms: Set<string>): string {
  // Preserve exact source characters, including accents, for evidence citations.
  const match = [...text.matchAll(/[\p{L}\p{N}\p{M}]+/gu)].find((m) =>
    tokens(m[0]).some((t) => queryTerms.has(t)),
  );
  const start = Math.max(0, (match?.index ?? 0) - 120);
  return text.slice(start, start + 700);
}

/** Basic lexical BM25 over available source excerpts; no embeddings or remote index. */
export function retrieveKnowledge(input: RetrievalInput): KnowledgeEvidence[] {
  const terms = new Set(tokens(input.query.slice(0, 2000)));
  const limit =
    input.limit === undefined
      ? 8
      : Math.min(50, Math.max(0, Math.floor(input.limit)));
  if (!terms.size || !Number.isFinite(limit) || limit === 0) return [];
  // ACL precedes corpus statistics as well as ranking. No cached deleted content.
  const documents = accessibleSources(input).map((source) => {
    const words = tokens(source.excerpt);
    const frequencies = new Map<string, number>();
    for (const word of words)
      frequencies.set(word, (frequencies.get(word) ?? 0) + 1);
    return { source, length: words.length, frequencies };
  });
  if (!documents.length) return [];
  const averageLength =
    documents.reduce((sum, d) => sum + d.length, 0) / documents.length || 1;
  const idf = new Map(
    [...terms].map((term) => {
      const count = documents.filter((d) => d.frequencies.has(term)).length;
      return [
        term,
        Math.log(1 + (documents.length - count + 0.5) / (count + 0.5)),
      ];
    }),
  );
  return documents
    .map(({ source, length, frequencies }) => {
      let score = 0;
      for (const term of terms) {
        const frequency = frequencies.get(term) ?? 0;
        score +=
          ((idf.get(term) ?? 0) * (frequency * 2.2)) /
          (frequency + 1.2 * (0.25 + (0.75 * length) / averageLength));
      }
      return {
        sourceId: source.id,
        sourceName: source.name,
        excerpt: snippet(source.excerpt, terms),
        sourceVersion: source.version,
        version: source.version,
        score,
        createdAt: source.createdAt,
        origin: source.origin,
        locator: `${source.id}@${source.version}`,
      };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.sourceId.localeCompare(b.sourceId))
    .slice(0, limit);
}
