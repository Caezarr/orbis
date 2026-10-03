/**
 * Defensive normalization of Composio Gmail/Outlook tool output into one shape.
 * Everything here is UNTRUSTED provider data: values are type-checked, capped and
 * never used to choose tools, recipients or policy except the original sender
 * address, which is validated as an email address.
 */
export type MailMessage = {
  provider: "gmail" | "outlook";
  id: string;
  threadId: string;
  from: { address: string; name?: string } | null;
  replyTo: string[];
  to: string[];
  subject: string;
  receivedAt: string;
  text: string;
  labels: string[];
  headers: Record<string, string>;
  isDraft: boolean;
  /** Sent by the mailbox owner (Gmail SENT label / Outlook sentitems). */
  fromOwner: boolean;
  webLink?: string;
};
export const MAX_BODY_CHARS = 8000;
const KEPT_HEADERS = new Set([
  "list-unsubscribe",
  "list-id",
  "precedence",
  "auto-submitted",
  "x-autoreply",
  "x-autorespond",
  "x-auto-response-suppress",
  "x-mailer",
  "return-path",
  "reply-to",
  "in-reply-to",
  "from",
  "subject",
  "to",
  "x-ms-exchange-generated-message-source",
]);
const ID = /^[A-Za-z0-9_\-=+/.:]{1,1024}$/;
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};
const str = (v: unknown, max = 2000) =>
  typeof v === "string" ? v.slice(0, max) : "";

export function parseData(data: unknown): unknown {
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch {
      return {};
    }
  }
  return data ?? {};
}
export function parseAddress(
  raw: string,
): { address: string; name?: string } | null {
  const angle = raw.match(/<([^<>\s]+@[^<>\s]+)>/);
  const address = (angle?.[1] ?? raw).trim().toLowerCase();
  if (!/^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/.test(address))
    return null;
  const name = angle
    ? raw.slice(0, raw.indexOf("<")).trim().replace(/^"|"$/g, "")
    : undefined;
  return { address, ...(name ? { name: name.slice(0, 200) } : {}) };
}
function addressList(raw: string) {
  return raw
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map((part) => parseAddress(part)?.address)
    .filter((a): a is string => !!a)
    .slice(0, 50);
}
export function htmlToText(html: string) {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}
function base64url(data: string) {
  try {
    return Buffer.from(
      data.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf8");
  } catch {
    return "";
  }
}
function gmailBody(payload: Obj): string {
  const plain: string[] = [];
  const html: string[] = [];
  const walk = (part: Obj, depth: number) => {
    if (depth > 8) return;
    const mime = str(part.mimeType, 100);
    const data = str(obj(part.body).data, 2_000_000);
    if (data && mime === "text/plain") plain.push(base64url(data));
    else if (data && mime === "text/html") html.push(base64url(data));
    if (Array.isArray(part.parts))
      for (const child of part.parts) walk(obj(child), depth + 1);
  };
  walk(payload, 0);
  return plain.length ? plain.join("\n") : htmlToText(html.join("\n"));
}
function headerMap(list: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(list)) return out;
  for (const h of list.slice(0, 300)) {
    const name = str(obj(h).name, 200).toLowerCase();
    if (KEPT_HEADERS.has(name) && !(name in out))
      out[name] = str(obj(h).value, 2000);
  }
  return out;
}
function messagesArray(data: unknown): Obj[] {
  const d = obj(parseData(data));
  const candidates = [
    d.messages,
    d.value,
    obj(d.response_data).value,
    obj(d.response_data).messages,
    obj(d.data).messages,
    obj(d.data).value,
  ];
  const found = candidates.find(Array.isArray) as unknown[] | undefined;
  if (found) return found.slice(0, 500).map(obj);
  // Single message resource (e.g. createReply response).
  if (typeof d.id === "string") return [d];
  if (typeof obj(d.response_data).id === "string")
    return [obj(d.response_data)];
  return [];
}
function iso(value: unknown) {
  const n =
    typeof value === "number" || /^\d+$/.test(str(value, 30))
      ? Number(value)
      : Date.parse(str(value, 100));
  return Number.isFinite(n) ? new Date(n).toISOString() : "";
}

export function normalizeGmailMessages(data: unknown): MailMessage[] {
  const out: MailMessage[] = [];
  for (const m of messagesArray(data)) {
    const id = str(m.messageId ?? m.id, 1024);
    const threadId = str(m.threadId ?? m.thread_id, 1024);
    if (!ID.test(id) || !ID.test(threadId)) continue;
    const payload = obj(m.payload);
    const headers = headerMap(payload.headers);
    const labels = (Array.isArray(m.labelIds) ? m.labelIds : [])
      .map((l) => str(l, 100))
      .filter(Boolean);
    const body =
      str(m.messageText, MAX_BODY_CHARS * 4) ||
      gmailBody(payload) ||
      str(obj(m.preview).body) ||
      str(m.snippet);
    const fromRaw = str(m.sender, 500) || headers.from || "";
    out.push({
      provider: "gmail",
      id,
      threadId,
      from: parseAddress(fromRaw),
      replyTo: headers["reply-to"] ? addressList(headers["reply-to"]) : [],
      to: addressList(str(m.to, 5000) || headers.to || ""),
      subject: str(m.subject, 500) || headers.subject || "",
      receivedAt: iso(m.internalDate ?? m.messageTimestamp),
      text: body.slice(0, MAX_BODY_CHARS),
      labels,
      headers,
      isDraft: labels.includes("DRAFT"),
      fromOwner: labels.includes("SENT"),
    });
  }
  return out;
}

const emailOf = (v: unknown) =>
  parseAddress(str(obj(obj(v).emailAddress).address, 320))?.address;
export function normalizeOutlookMessages(
  data: unknown,
  options: { includeDrafts?: boolean } = {},
): MailMessage[] {
  const out: MailMessage[] = [];
  for (const m of messagesArray(data)) {
    const id = str(m.id, 1024);
    const threadId = str(m.conversationId, 1024);
    if (!ID.test(id) || !ID.test(threadId)) continue;
    if (m.isDraft === true && !options.includeDrafts) continue;
    const fromAddress = emailOf(m.from) ?? emailOf(m.sender);
    const body = obj(m.body);
    const content = str(body.content, MAX_BODY_CHARS * 8);
    const text =
      str(body.contentType, 20).toLowerCase() === "html"
        ? htmlToText(content)
        : content || str(m.bodyPreview);
    const link = str(m.webLink, 2000);
    out.push({
      provider: "outlook",
      id,
      threadId,
      from: fromAddress
        ? {
            address: fromAddress,
            ...(str(obj(obj(m.from).emailAddress).name, 200)
              ? { name: str(obj(obj(m.from).emailAddress).name, 200) }
              : {}),
          }
        : null,
      replyTo: (Array.isArray(m.replyTo) ? m.replyTo : [])
        .map(emailOf)
        .filter((a): a is string => !!a),
      to: (Array.isArray(m.toRecipients) ? m.toRecipients : [])
        .map(emailOf)
        .filter((a): a is string => !!a),
      subject: str(m.subject, 500),
      receivedAt: iso(m.receivedDateTime ?? m.sentDateTime),
      text: text.slice(0, MAX_BODY_CHARS),
      labels: [
        ...(Array.isArray(m.categories) ? m.categories : []).map((c) =>
          str(c, 100),
        ),
        ...(m.inferenceClassification === "other" ? ["OUTLOOK_OTHER"] : []),
      ].filter(Boolean),
      headers: headerMap(m.internetMessageHeaders),
      isDraft: m.isDraft === true,
      fromOwner: false,
      ...(safeOutlookLink(link) ? { webLink: link } : {}),
    });
  }
  return out;
}
function safeOutlookLink(raw: string) {
  try {
    const u = new URL(raw);
    return (
      u.protocol === "https:" &&
      !u.username &&
      /(^|\.)(outlook\.office\.com|outlook\.office365\.com|outlook\.live\.com)$/.test(
        u.hostname,
      )
    );
  } catch {
    return false;
  }
}
