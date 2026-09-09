import { getPackage } from "@/lib/capabilities/registry";
import type { CapabilityPackage } from "@/lib/domain/types";

export type IntentResolution =
  | {
      kind: "existing";
      slug: string;
      reason: string;
      package: CapabilityPackage;
    }
  | {
      kind: "composition";
      slugs: string[];
      reason: string;
      packages: CapabilityPackage[];
    }
  | {
      kind: "unsupported";
      reason: string;
      interim: string;
    };

const WRITE_HINTS = /send email|publish|post to|invoice|wire|transfer|crm write|create account/i;

export function resolveIntent(text: string): IntentResolution {
  const q = text.toLowerCase();
  if (/request|devis|quote|customer|réponse|inbound|support/.test(q) && /analy|structur|reply|réponse/.test(q)) {
    const pkg = getPackage("request-analysis")!;
    return { kind: "existing", slug: pkg.slug, reason: "Matches the customer-request analysis contract.", package: pkg };
  }
  if (/meeting|brief|call|réunion|prep/.test(q)) {
    const pkg = getPackage("meeting-prep")!;
    return { kind: "existing", slug: pkg.slug, reason: "Matches meeting preparation.", package: pkg };
  }
  if (/linkedin|content|post|newsletter|draft/.test(q)) {
    const pkg = getPackage("content-draft")!;
    return { kind: "existing", slug: pkg.slug, reason: "Matches sourced content drafting.", package: pkg };
  }
  if (/research|tender|marché|competitor|veille/.test(q)) {
    const pkg = getPackage("research-brief")!;
    return { kind: "existing", slug: pkg.slug, reason: "Matches research brief.", package: pkg };
  }
  if (/quote|devis|pricing/.test(q)) {
    const quote = getPackage("quote-prep")!;
    const request = getPackage("request-analysis")!;
    return {
      kind: "composition",
      slugs: [request.slug, quote.slug],
      reason: "No standalone quote runner in alpha. Compose request analysis (ready) then quote preparation (composable, approval-gated).",
      packages: [request, quote],
    };
  }
  if (WRITE_HINTS.test(q)) {
    return {
      kind: "unsupported",
      reason: "External writes are not an alpha capability. The platform can analyse, draft and wait for approval.",
      interim: "Start with customer-request analysis or a sourced content draft. Sending stays behind an approval.",
    };
  }
  if (q.trim().length < 8) {
    return {
      kind: "unsupported",
      reason: "Need a business outcome, not a single word.",
      interim: "Describe the result you want, the input you have, and whether anything should leave the company.",
    };
  }
  const research = getPackage("research-brief")!;
  return {
    kind: "existing",
    slug: research.slug,
    reason: "No exact package match. A research brief is a safe first result with no external effects.",
    package: research,
  };
}
