/**
 * Deterministic, keyword-based reply classification. The product spec
 * explicitly lists reply classification as a forbidden AI use case (see
 * docs/ai-boundaries.md) — this package never imports an AI SDK, and this
 * file is pure string matching. When no rule confidently matches, the
 * result is UNCLASSIFIED rather than guessed — a human reviews those in
 * the conversations UI. Rules are intentionally conservative for
 * INTERESTED/NOT_INTERESTED (used for the qualified-meeting-rate metric,
 * which must not be inflated by false positives).
 */
export type ReplyClassification =
  | "INTERESTED"
  | "NOT_INTERESTED"
  | "OUT_OF_OFFICE"
  | "UNSUBSCRIBE_REQUEST"
  | "BOUNCE"
  | "UNCLASSIFIED";

function containsAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

const UNSUBSCRIBE_PHRASES = [
  "unsubscribe",
  "remove me from",
  "take me off",
  "stop emailing",
  "stop contacting",
  "do not contact",
];

const OUT_OF_OFFICE_PHRASES = [
  "out of office",
  "out of the office",
  "ooo",
  "automatic reply",
  "auto-reply",
  "on vacation",
  "on leave",
  "currently away",
];

const BOUNCE_PHRASES = [
  "delivery status notification",
  "undelivered mail returned to sender",
  "mail delivery failed",
  "address not found",
  "mailbox unavailable",
];

const NOT_INTERESTED_PHRASES = [
  "not interested",
  "no thank you",
  "no thanks",
  "please remove",
  "not the right time",
  "not a fit",
  "no longer",
];

const INTERESTED_PHRASES = [
  "let's schedule",
  "let's set up a call",
  "book a time",
  "sounds interesting",
  "sounds good, let's",
  "happy to chat",
  "interested in learning more",
  "yes, let's talk",
];

export function classifyReply(subject: string, body: string): ReplyClassification {
  const text = `${subject}\n${body}`.toLowerCase();

  if (containsAny(text, BOUNCE_PHRASES)) return "BOUNCE";
  if (containsAny(text, UNSUBSCRIBE_PHRASES)) return "UNSUBSCRIBE_REQUEST";
  if (containsAny(text, OUT_OF_OFFICE_PHRASES)) return "OUT_OF_OFFICE";
  if (containsAny(text, NOT_INTERESTED_PHRASES)) return "NOT_INTERESTED";
  if (containsAny(text, INTERESTED_PHRASES)) return "INTERESTED";
  return "UNCLASSIFIED";
}
