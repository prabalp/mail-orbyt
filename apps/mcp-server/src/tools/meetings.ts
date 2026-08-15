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

const meetingOutputFields = {
  id: z.string().optional(),
  organisationId: z.string().optional(),
  leadId: z.string().optional(),
  campaignId: z.string().nullable().optional(),
  conversationId: z.string().nullable().optional(),
  status: z.string().optional(),
  qualified: z.boolean().optional(),
  scheduledFor: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  bookedAt: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
};

export const MEETING_TOOLS: RouteToolDescriptor[] = [
  {
    name: "list_meetings",
    title: "List meetings",
    description: "List meetings for the organisation.",
    method: "GET",
    pathTemplate: "/api/organisations/{organisationId}/meetings",
    requiredScope: "profile",
    inputShape: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
    outputShape: {
      meetings: z
        .array(z.object({ ...meetingOutputFields, lead: leadShape }).partial().passthrough())
        .optional(),
    },
  },
  {
    name: "create_meeting",
    title: "Record a meeting",
    description: "Record a new meeting for a lead.",
    method: "POST",
    pathTemplate: "/api/organisations/{organisationId}/meetings",
    requiredScope: "conversations:review",
    inputShape: {
      leadId: z.string().min(1),
      campaignId: z.string().min(1).optional(),
      conversationId: z.string().min(1).optional(),
      scheduledFor: z.string().optional().describe("ISO 8601 datetime"),
      notes: z.string().max(2000).optional(),
    },
    // Books a new meeting row each call — twice means two meetings.
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    outputShape: { ...meetingOutputFields },
  },
  {
    name: "update_meeting",
    title: "Update meeting",
    description: "Update a meeting's status, notes, schedule, or qualification outcome.",
    method: "PATCH",
    pathTemplate: "/api/organisations/{organisationId}/meetings/{meetingId}",
    requiredScope: "conversations:review",
    inputShape: {
      meetingId: z.string().min(1),
      status: z.enum(["SCHEDULED", "COMPLETED", "NO_SHOW", "CANCELLED"]).optional(),
      qualified: z
        .boolean()
        .optional()
        .describe("The human judgment call feeding the product's core \"qualified meeting rate\" metric"),
      notes: z.string().max(2000).optional(),
      scheduledFor: z.string().optional().describe("ISO 8601 datetime"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    outputShape: { ...meetingOutputFields },
  },
];
