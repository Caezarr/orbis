import { z } from "zod";
export const contentPackSchema = z.object({
  script: z.string().min(30).max(20000),
  sourceIds: z.array(z.string().min(1)).min(1),
  claims: z.array(
    z.object({
      text: z.string().min(1),
      sourceIds: z.array(z.string()).min(1),
    }),
  ),
  rightsConfirmed: z.boolean(),
  approvedScript: z.boolean(),
  estimatedCostEur: z.number().finite().min(0),
  perPieceLimitEur: z.number().finite().positive(),
  remainingBudgetEur: z.number().finite().min(0),
  bannedPhrases: z.array(z.string()).default([]),
});
export function contentProductionGate(
  raw: unknown,
  approvedSourceIds: string[],
) {
  const p = contentPackSchema.parse(raw);
  const reasons: string[] = [];
  if (!p.approvedScript)
    reasons.push(
      "The creator must approve this script version before paid generation.",
    );
  if (!p.rightsConfirmed)
    reasons.push("Confirm source, asset, voice and likeness rights.");
  if (
    [...p.sourceIds, ...p.claims.flatMap((c) => c.sourceIds)].some(
      (id) => !approvedSourceIds.includes(id),
    )
  )
    reasons.push(
      "The pack references a source outside the approved knowledge scope.",
    );
  if (
    p.bannedPhrases.some(
      (phrase) =>
        phrase.trim() &&
        p.script.toLocaleLowerCase().includes(phrase.toLocaleLowerCase()),
    )
  )
    reasons.push("The script contains an expression excluded by the creator.");
  if (p.estimatedCostEur > Math.min(p.perPieceLimitEur, p.remainingBudgetEur))
    reasons.push("The estimated generation cost exceeds the available budget.");
  return {
    allowed: reasons.length === 0,
    reasons,
    requiresPublicationApproval: true as const,
  };
}
