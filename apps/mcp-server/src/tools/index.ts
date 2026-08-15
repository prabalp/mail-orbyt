import type { LinkToolDescriptor, RouteToolDescriptor } from "./registry.js";
import { GMAIL_TOOLS } from "./gmail.js";
import { LEAD_TOOLS } from "./leads.js";
import { ORGANISATION_TOOLS } from "./organisations.js";
import { COMPANY_TOOLS } from "./companies.js";
import { CAMPAIGN_TOOLS } from "./campaigns.js";
import { CONVERSATION_TOOLS } from "./conversations.js";
import { RESEARCH_TOOLS } from "./research.js";
import { ANALYTICS_TOOLS } from "./analytics.js";
import { MEETING_TOOLS } from "./meetings.js";
import { INBOX_TOOLS } from "./inboxes.js";
import { SIGNATURE_TOOLS } from "./signatures.js";
import { MEMBER_TOOLS } from "./members.js";
import { INVITATION_TOOLS } from "./invitations.js";
import { SETTINGS_TOOLS } from "./settings.js";
import { COMPLIANCE_TOOLS } from "./compliance.js";
import { DNS_CHECK_TOOLS } from "./dns-checks.js";
import { LEAD_LIST_TOOLS } from "./lead-lists.js";
import { EMAIL_DRAFT_TOOLS } from "./email-drafts.js";
import { SUPPRESSION_TOOLS } from "./suppressions.js";
import { MCP_CONNECTION_TOOLS } from "./mcp-connections.js";
import { COMPOSITE_TOOLS } from "./composite.js";

export const ALL_TOOLS: RouteToolDescriptor[] = [
  ...LEAD_TOOLS,
  ...ORGANISATION_TOOLS,
  ...COMPANY_TOOLS,
  ...CAMPAIGN_TOOLS,
  ...CONVERSATION_TOOLS,
  ...RESEARCH_TOOLS,
  ...ANALYTICS_TOOLS,
  ...MEETING_TOOLS,
  ...INBOX_TOOLS,
  ...SIGNATURE_TOOLS,
  ...MEMBER_TOOLS,
  ...INVITATION_TOOLS,
  ...SETTINGS_TOOLS,
  ...COMPLIANCE_TOOLS,
  ...DNS_CHECK_TOOLS,
  ...LEAD_LIST_TOOLS,
  ...EMAIL_DRAFT_TOOLS,
  ...SUPPRESSION_TOOLS,
  ...MCP_CONNECTION_TOOLS,
  ...COMPOSITE_TOOLS,
];

/** Tools whose result is computed directly rather than fetched from apps/web — see registry.ts's LinkToolDescriptor. */
export const ALL_LINK_TOOLS: LinkToolDescriptor[] = [...GMAIL_TOOLS];
