import { z } from "zod";
import type { RouteToolDescriptor } from "./registry.js";

/** `rate` is null rather than 0 when nobody has been contacted yet — no denominator, not a zero result. */
const meetingRateShape = z
  .object({
    uniqueProspectsContacted: z.number(),
    qualifiedMeetingsBooked: z.number(),
    rate: z.number().nullable(),
  })
  .partial()
  .passthrough();

export const ANALYTICS_TOOLS: RouteToolDescriptor[] = [
  {
    name: "get_analytics",
    title: "Get analytics",
    description: "Get organisation-wide analytics dashboard data, including the qualified meeting rate.",
    method: "GET",
    pathTemplate: "/api/organisations/{organisationId}/analytics",
    requiredScope: "analytics:view",
    inputShape: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
    outputShape: {
      overall: meetingRateShape.optional(),
      replyRate: z.number().nullable().optional(),
      campaigns: z
        .array(
          meetingRateShape.extend({ campaignId: z.string(), campaignName: z.string() }).partial().passthrough(),
        )
        .optional(),
    },
  },
];
