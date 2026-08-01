/**
 * Resolves the human-readable sender name for an inbox: its configured
 * `displayName` if set, else a best-effort name derived from the local part
 * of its email address (e.g. "alex.rivera@acme.example" -> "Alex Rivera").
 * Used wherever AI-generated copy needs "who is this email from" — the
 * inbox actually sending it, not the organisation or whichever user clicked
 * generate.
 */
export function resolveInboxSenderName(inbox: {
  displayName: string | null;
  emailAddress: string;
}): string {
  if (inbox.displayName) return inbox.displayName;

  const localPart = inbox.emailAddress.split("@")[0] ?? inbox.emailAddress;
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(" ");
}
