import type { MailMessage } from "@/lib/integrations/mailbox-normalize";
import type { ModelUsage } from "@/lib/runtime/inbox-replies";
import { buildCandidate, type CandidateFact } from "./candidates";
import { classifyOutcome, type Outcome } from "./diff";
import type { BrainModel } from "./model";

/*
 * Level 5 — learning from edits. For real (non-simulated) Orbis drafts, later
 * incremental batches look for the owner's sent reply in the thread
 * (list_thread_sent, read-only), classify the outcome deterministically, and
 * for edited replies ask the model for at most 2 candidate rules/facts. They
 * go to the same validation queue as extracted facts. Nothing is auto-applied.
 */
export const OUTCOME_CHECK_LIMIT = 5;
export type DueDraft = {
  rowId: string;
  threadId: string;
  draftedAt: string;
  draftPreview: string;
};
export type OutcomeRecord = {
  outcome: Outcome;
  similarity?: number;
  draftChars: number;
  sentChars?: number;
  proposals: number;
};
export type OutcomeStore = {
  dueDrafts(limit: number): Promise<DueDraft[]>;
  recordOutcome(rowId: string, record: OutcomeRecord): Promise<void>;
  reserve(rowId: string, cents: number): Promise<string | null>;
  addUsage(usageId: string, usage: ModelUsage): Promise<void>;
  saveCandidates(candidates: CandidateFact[]): Promise<{ inserted: number }>;
};
export type OutcomeStats = {
  checked: number;
  sentAsIs: number;
  sentEdited: number;
  notUsed: number;
  pending: number;
  proposals: number;
  budgetExhausted: boolean;
  failed: number;
};

export async function checkDraftOutcomes(params: {
  mailbox: { listThreadSent(threadId: string): Promise<MailMessage[]> };
  model: BrainModel;
  store: OutcomeStore;
  ownerAddresses?: string[];
  trustedText?: string;
  cents: number;
  now?: Date;
  limit?: number;
  shouldYield?: () => boolean;
}): Promise<OutcomeStats> {
  const now = params.now ?? new Date();
  const stats: OutcomeStats = {
    checked: 0,
    sentAsIs: 0,
    sentEdited: 0,
    notUsed: 0,
    pending: 0,
    proposals: 0,
    budgetExhausted: false,
    failed: 0,
  };
  for (const due of await params.store.dueDrafts(params.limit ?? OUTCOME_CHECK_LIMIT)) {
    if (params.shouldYield?.()) break;
    try {
      const sent = (await params.mailbox.listThreadSent(due.threadId)).map((m) => ({
        id: m.id,
        sentAt: m.receivedAt,
        text: m.text,
        to: m.to,
        from: m.from?.address,
      }));
      const result = classifyOutcome({ draft: due.draftPreview, draftedAt: due.draftedAt, sent, now });
      stats.checked++;
      let proposals = 0;
      if (result.outcome === "sent_edited" && result.reply && !stats.budgetExhausted) {
        const usageId = await params.store.reserve(due.rowId, params.cents);
        if (!usageId) stats.budgetExhausted = true;
        else {
          const explained = await params.model.explainEdit({
            draft: due.draftPreview,
            sent: result.reply.own,
          });
          await params.store.addUsage(usageId, explained.usage);
          const reply = sent.find((s) => s.id === result.reply!.id);
          const candidates = explained.output.proposals
            .slice(0, 2)
            .map((p) =>
              buildCandidate(
                {
                  category: p.kind === "rule" && p.category !== "tone" ? "rule" : p.category,
                  topic: p.topic,
                  statement: p.statement,
                  confidence: 0.6,
                  quotes: [
                    {
                      quote: p.quote,
                      evidence: {
                        text: result.reply!.own,
                        messageId: result.reply!.id,
                        sentAt: result.reply!.sentAt,
                        redaction: {
                          ownerAddresses: [
                            ...(params.ownerAddresses ?? []),
                            ...(reply?.from ? [reply.from] : []),
                          ],
                          thirdParties: (reply?.to ?? []).filter((a) => a !== reply?.from),
                          trustedText: params.trustedText,
                        },
                      },
                    },
                  ],
                },
                "edit_diff",
                { inboxMessageId: due.rowId },
              ),
            )
            .filter((c): c is CandidateFact => !!c);
          proposals = (await params.store.saveCandidates(candidates)).inserted;
          stats.proposals += proposals;
        }
      }
      await params.store.recordOutcome(due.rowId, {
        outcome: result.outcome,
        similarity: result.similarity,
        draftChars: due.draftPreview.length,
        sentChars: result.reply?.own.length,
        proposals,
      });
      if (result.outcome === "sent_as_is") stats.sentAsIs++;
      else if (result.outcome === "sent_edited") stats.sentEdited++;
      else if (result.outcome === "not_used") stats.notUsed++;
      else stats.pending++;
    } catch {
      // Best effort: a failed check is retried by a later batch; never blocks drafting.
      stats.failed++;
    }
  }
  return stats;
}
