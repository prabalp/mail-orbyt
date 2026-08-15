import { z } from "zod";
import type { RouteToolDescriptor } from "./registry.js";

const leadShape = z
  .object({
    id: z.string(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    email: z.string().nullable(),
    title: z.string().nullable(),
    status: z.string(),
  })
  .partial()
  .passthrough();

/**
 * `classification` is the deterministic keyword verdict from
 * packages/conversations' reply classifier (POSITIVE / OUT_OF_OFFICE /
 * UNSUBSCRIBE / …), never an AI judgement — read it as a label, not advice.
 */
const messageShape = z
  .object({
    id: z.string(),
    conversationId: z.string(),
    direction: z.string(),
    gmailMessageId: z.string().nullable(),
    classification: z.string().nullable(),
    snippet: z.string().nullable(),
    occurredAt: z.string(),
  })
  .partial()
  .passthrough();

const conversationOutputFields = {
  id: z.string().optional(),
  organisationId: z.string().optional(),
  leadId: z.string().optional(),
  inboxId: z.string().optional(),
  gmailThreadId: z.string().optional(),
  subject: z.string().nullable().optional(),
  status: z.string().optional(),
  lastMessageAt: z.string().optional(),
  lead: leadShape.optional(),
};

/**
 * Read-only by design: replies are answered by a human in Gmail, so there is
 * no send-reply tool here and never should be (docs/replies-conversations.md).
 */
export const CONVERSATION_TOOLS: RouteToolDescriptor[] = [
  {
    name: "list_conversations",
    title: "List conversations",
    description: "List reply conversations for the organisation.",
    method: "GET",
    pathTemplate: "/api/organisations/{organisationId}/conversations",
    requiredScope: "conversations:review",
    inputShape: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
    // Each listed conversation carries only its most recent message.
    outputShape: {
      conversations: z
        .array(
          z
            .object({ ...conversationOutputFields, messages: z.array(messageShape) })
            .partial()
            .passthrough(),
        )
        .optional(),
    },
  },
  {
    name: "get_conversation",
    title: "Get conversation",
    description: "Get a single conversation and its message thread.",
    method: "GET",
    pathTemplate: "/api/organisations/{organisationId}/conversations/{conversationId}",
    requiredScope: "conversations:review",
    inputShape: { conversationId: z.string().min(1) },
    annotations: { readOnlyHint: true, openWorldHint: false },
    // The full thread here, oldest message first.
    outputShape: { ...conversationOutputFields, messages: z.array(messageShape).optional() },
  },
];
