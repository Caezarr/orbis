import type { RuntimeMode } from "@/lib/domain/types";

const WRITE_TOOLS = new Set([
  "send_email",
  "create_invoice",
  "delete_record",
  "crm_write",
  "publish",
  "create_quote",
  "submit_tender",
  "chat:write",
]);

export type BrokerDecision =
  | { allowed: true; mode: RuntimeMode; tool: string }
  | { allowed: false; code: "ACTION_NOT_ALLOWED_IN_TEST_MODE" | "SCOPE_DENIED" | "APPROVAL_REQUIRED"; tool: string; detail: string };

export function brokerDecide(tool: string, mode: RuntimeMode): BrokerDecision {
  const isWrite = WRITE_TOOLS.has(tool) || /write|send|publish|delete|create_/.test(tool);
  if (mode === "test" && isWrite) {
    return {
      allowed: false,
      code: "ACTION_NOT_ALLOWED_IN_TEST_MODE",
      tool,
      detail: "Test mode refuses external writes even if a model requests them.",
    };
  }
  if (mode === "supervised" && isWrite) {
    return {
      allowed: false,
      code: "APPROVAL_REQUIRED",
      tool,
      detail: "Supervised mode prepares the effect and waits for an approval bound to the payload hash.",
    };
  }
  return { allowed: true, mode, tool };
}
