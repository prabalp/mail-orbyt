import type { GenerateEmailInput, RewriteEmailInput } from "./types";

const SYSTEM_PREAMBLE = `You write short, personalized outbound sales emails.

Hard rules — never break these:
1. Use ONLY the facts explicitly provided to you below. Never invent, assume, guess, or infer any fact about the recipient, their company, or anything else not given to you.
2. If no facts are provided, write a generic but relevant email based only on the sender's stated call-to-action — do not fabricate personalization to compensate.
3. Never mention or allude to research methods, data sources, "I noticed", browsing, or how any fact was obtained.
4. Never include a URL, phone number, or email address other than ones explicitly given to you.
5. Keep the email short: 2-4 short paragraphs or fewer, no more than ~150 words in the body.
6. Write in plain text, no markdown, no HTML, no emoji.
7. Do not make promises, guarantees, discounts, or claims on the sender's behalf that were not given to you.
8. End the email in a way that supports the stated call-to-action, without being pushy.`;

function factsBlock(facts: GenerateEmailInput["facts"]): string {
  if (facts.length === 0) {
    return "No researched facts are available for this recipient.";
  }
  return facts.map((fact) => `- [${fact.category}] ${fact.value}`).join("\n");
}

export function buildGenerateEmailPrompt(input: GenerateEmailInput): {
  system: string;
  user: string;
} {
  const recipient = [input.leadFirstName, input.leadTitle, input.companyName]
    .filter(Boolean)
    .join(", ");

  const lines: string[] = [
    `Sender: ${input.senderName} at ${input.senderCompanyName}`,
    `Recipient: ${recipient || "unknown name/title/company — do not guess, address generically"}`,
    `Call to action: ${input.callToAction}`,
    "",
    "Facts you may reference (and ONLY these):",
    factsBlock(input.facts),
  ];

  if (input.generationType === "FOLLOW_UP") {
    lines.push(
      "",
      "This is a FOLLOW-UP to an email that received no reply. Reference it briefly, add one new angle if the facts support it, and keep it shorter than the original. Do not repeat the original verbatim.",
      "",
      `Original email subject: ${input.priorEmail?.subject ?? ""}`,
      `Original email body:\n${input.priorEmail?.body ?? ""}`,
    );
  } else if (input.generationType === "CLOSE_THE_LOOP") {
    lines.push(
      "",
      "This is a CLOSE-THE-LOOP email — the final message in the sequence after no reply to prior emails. Briefly acknowledge you haven't heard back, leave the door open, and signal this is the last outreach in this sequence. Keep it very short (2-3 sentences).",
      "",
      `Most recent email subject: ${input.priorEmail?.subject ?? ""}`,
      `Most recent email body:\n${input.priorEmail?.body ?? ""}`,
    );
  } else {
    lines.push("", "This is the FIRST email in the sequence to this recipient.");
  }

  return { system: SYSTEM_PREAMBLE, user: lines.join("\n") };
}

const REWRITE_INSTRUCTIONS: Record<RewriteEmailInput["style"], string> = {
  SHORTER:
    "Rewrite this email to be significantly shorter and more concise, keeping only the essential point and call to action.",
  FORMAL:
    "Rewrite this email in a more formal, professional register — no slang, no contractions, more traditional business tone.",
  DIRECT:
    "Rewrite this email to be more direct and to the point — lead with the ask, cut any hedging or throat-clearing.",
};

export function buildRewriteEmailPrompt(input: RewriteEmailInput): {
  system: string;
  user: string;
} {
  const system = `${SYSTEM_PREAMBLE}

You are REWRITING an existing email, not writing a new one. Do not add any new factual claim, statistic, name, or detail that isn't already present in the original email. Only adjust tone, length, and structure as instructed.`;

  const user = [
    REWRITE_INSTRUCTIONS[input.style],
    "",
    `Original subject: ${input.subject}`,
    `Original body:\n${input.body}`,
  ].join("\n");

  return { system, user };
}
