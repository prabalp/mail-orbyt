import { z } from "zod";
import type { RouteToolDescriptor } from "./registry.js";

export const COMPLIANCE_TOOLS: RouteToolDescriptor[] = [
  {
    name: "purge_stale_data",
    title: "Purge stale data",
    description: "Manually purge stale discarded email drafts and import rows past the retention window.",
    method: "POST",
    pathTemplate: "/api/organisations/{organisationId}/compliance/retention-purge",
    requiredScope: "organisation:delete",
    inputShape: {
      retentionDays: z.number().int().min(1).max(3650).optional().describe("Defaults to 90"),
    },
    // Hard deletes with no undo, and the cutoff moves with wall-clock time —
    // a second run with the same arguments purges more.
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    outputShape: {
      discardedDraftsDeleted: z.number().optional(),
      importRowsDeleted: z.number().optional(),
    },
  },
];
