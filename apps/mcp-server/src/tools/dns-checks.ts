import { z } from "zod";
import type { RouteToolDescriptor } from "./registry.js";

export const DNS_CHECK_TOOLS: RouteToolDescriptor[] = [
  {
    name: "check_domain_dns",
    title: "Re-check a domain's DNS records",
    description: "Re-run SPF/DKIM/DMARC deliverability checks for a sending domain.",
    method: "POST",
    pathTemplate: "/api/organisations/{organisationId}/dns-checks",
    requiredScope: "inboxes:manage",
    inputShape: {
      domain: z.string().min(1),
      dkimSelector: z.string().optional(),
    },
    // openWorldHint: this is the one tool that reaches outside Mail Orbyt —
    // it performs real DNS TXT lookups against the public resolver. It writes
    // only by upserting the single check record keyed by (organisation,
    // domain), so re-running it is idempotent and destroys nothing.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    outputShape: {
      id: z.string().optional(),
      domain: z.string().optional(),
      spfStatus: z.string().optional(),
      spfRecord: z.string().nullable().optional(),
      dkimSelector: z.string().nullable().optional(),
      dkimStatus: z.string().optional(),
      dkimRecord: z.string().nullable().optional(),
      dmarcStatus: z.string().optional(),
      dmarcRecord: z.string().nullable().optional(),
      checkedAt: z.string().optional(),
    },
  },
];
