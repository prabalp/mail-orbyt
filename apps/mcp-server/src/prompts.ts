import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * Reusable starting points for the multi-step asks people actually bring to
 * this product, so "plan a campaign" is one click rather than a paragraph
 * the user has to write correctly. Each prompt encodes the ORDER of tool
 * calls that works — the sequencing is the hard-won part, not the wording.
 */
export function registerPrompts(server: McpServer): void {
  const userMessage = (text: string) => ({
    messages: [{ role: "user" as const, content: { type: "text" as const, text } }],
  });

  server.registerPrompt(
    "plan_campaign",
    {
      title: "Plan a campaign",
      description:
        "Draft a multi-step outbound sequence for a lead list, ready to review before launch.",
      argsSchema: {
        leadListName: z.string().describe("The lead list to target, by name"),
        offer: z.string().describe("What you're offering and the call to action you want"),
        stepCount: z.string().optional().describe("How many steps in the sequence (default 3)"),
      },
    },
    ({ leadListName, offer, stepCount }) =>
      userMessage(
        `Plan a ${stepCount ?? "3"}-step outbound campaign targeting the lead list "${leadListName}".

The offer and call to action: ${offer}

Do this in order:
1. Call list_lead_lists and find "${leadListName}"; report how many leads it holds.
2. Call get_org_overview to check I have connected, DNS-healthy inboxes to send from. If I do not, stop and tell me — a campaign with no sending inbox will never leave the outbox.
3. Sample a few leads with list_leads and check whether research has run for them. Emails are generated only from verified research facts, so flag it if the list is unresearched.
4. Propose the sequence: for each step give the type (INITIAL, then FOLLOW_UP, and a final CLOSE_THE_LOOP), the delay in days after the previous step, and the actual subject and body copy.
5. Show me the plan and WAIT for my approval. Do not call create_campaign_with_sequence until I say go.`,
      ),
  );

  server.registerPrompt(
    "triage_replies",
    {
      title: "Triage today's replies",
      description: "Summarise conversations waiting on a human and recommend what to do with each.",
      argsSchema: {},
    },
    () =>
      userMessage(
        `Triage the replies waiting on me.

1. Call list_conversations filtered to those needing review.
2. Group them by classification (interested, not interested, out of office, referral, unsubscribe request).
3. For each one that needs a human: summarise what they actually said in one line, and recommend an action — book a meeting, log a meeting that already happened, suppress the address, or drop it.
4. For anyone asking to be removed, suppress them with add_suppression (reason UNSUBSCRIBE) after confirming with me.

Note: you cannot send replies — I write those myself in Gmail. Give me what I need to write them quickly, not a draft you intend to send.`,
      ),
  );

  server.registerPrompt(
    "draft_follow_up",
    {
      title: "Draft a follow-up",
      description:
        "Generate a follow-up email for a specific lead, grounded in their research facts.",
      argsSchema: {
        lead: z.string().describe("The lead's name or email address"),
        angle: z.string().optional().describe("Any particular angle or call to action to use"),
      },
    },
    ({ lead, angle }) =>
      userMessage(
        `Draft a follow-up email for ${lead}.

1. Call find_lead to resolve "${lead}" to a lead id. If more than one matches, ask me which.
2. Call get_lead and list_lead_emails so the follow-up references what was already sent — do not repeat an earlier email's angle.
3. Check get_lead_research. If research has not run, run it with start_lead_research and wait, because copy is generated only from verified facts.
4. Call generate_lead_email_draft with generationType FOLLOW_UP${angle ? ` and this call to action: ${angle}` : ""}.
5. Show me the draft and what facts it drew on.`,
      ),
  );

  server.registerPrompt(
    "onboard_inbox",
    {
      title: "Onboard my first inbox",
      description:
        "Walk through connecting a Google Workspace sending inbox and verifying it can send.",
      argsSchema: {},
    },
    () =>
      userMessage(
        `Help me connect a sending inbox, start to finish.

1. Call list_inboxes to see whether I already have one.
2. Call connect_inbox and give me the authorization link, plus what I need to do in the browser.
3. Wait for me to say I've finished, then call get_inbox_connection_status to confirm it actually connected.
4. Run a DNS check on the sending domain and explain any SPF, DKIM, or DMARC problem in plain language — a domain that fails these will land in spam no matter how good the copy is.
5. Tell me the inbox's daily sending limit and warmup state before I enroll anyone.`,
      ),
  );
}
