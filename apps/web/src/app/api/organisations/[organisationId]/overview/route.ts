import { ForbiddenError, hasPermission, UnauthenticatedError } from "@mail-orbyt/authentication";
import { getQualifiedMeetingRate, getReplyRate } from "@mail-orbyt/analytics";
import { prisma } from "@mail-orbyt/database";
import { NextResponse } from "next/server";
import { authenticateOrganisationRequest } from "@/lib/api-auth";

interface RouteParams {
  params: Promise<{ organisationId: string }>;
}

/**
 * The "where do things stand" read — the default entry point for an
 * assistant asked an open question about the organisation. Deliberately
 * counts rather than rows: this is a dashboard, and the follow-up drilldowns
 * (list_inboxes, list_campaigns, list_conversations) already exist.
 *
 * Every section respects the caller's own permissions rather than the
 * union of them: analytics are omitted without `analytics:view`, exactly as
 * the dedicated `/analytics` route would refuse.
 */
export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId } = await params;

  let membership: Awaited<ReturnType<typeof authenticateOrganisationRequest>>["membership"];
  try {
    ({ membership } = await authenticateOrganisationRequest(request, { organisationId }));
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const [inboxes, dnsChecks, campaigns, leadCount, suppressionCount] = await Promise.all([
    // Field-picked: the Inbox model carries encrypted OAuth tokens.
    prisma.inbox.findMany({
      where: { organisationId },
      select: {
        id: true,
        emailAddress: true,
        displayName: true,
        status: true,
        dailySendLimit: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.domainDnsCheck.findMany({
      where: { organisationId },
      select: {
        domain: true,
        spfStatus: true,
        dkimStatus: true,
        dmarcStatus: true,
        checkedAt: true,
      },
    }),
    prisma.campaign.findMany({
      where: { organisationId, status: { notIn: ["ARCHIVED"] } },
      select: { id: true, name: true, status: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.lead.count({ where: { organisationId, status: "ACTIVE" } }),
    prisma.suppressionEntry.count({ where: { organisationId } }),
  ]);

  // "Needs review" is not a stored flag: it's an OPEN thread whose most
  // recent message came FROM the lead, i.e. the ball is in a human's court.
  // Replies are answered by a person in Gmail (docs/replies-conversations.md),
  // so this count is the actual to-do list, not a queue this system works off.
  const canReviewConversations = hasPermission(membership.role, "conversations:review");
  const conversationsNeedingReview = canReviewConversations
    ? (
        await prisma.conversation.findMany({
          where: { organisationId, status: "OPEN" },
          select: {
            messages: { orderBy: { occurredAt: "desc" }, take: 1, select: { direction: true } },
          },
        })
      ).filter((conversation) => conversation.messages[0]?.direction === "INBOUND").length
    : null;

  const canViewAnalytics = hasPermission(membership.role, "analytics:view");
  const [qualifiedMeetingRate, replyRate] = canViewAnalytics
    ? await Promise.all([
        getQualifiedMeetingRate(prisma, { organisationId }),
        getReplyRate(prisma, { organisationId }),
      ])
    : [null, null];

  // A domain that fails SPF/DKIM/DMARC lands in spam regardless of how good
  // the copy is, so this is surfaced at the top level rather than buried in
  // a separate DNS call nobody makes.
  const unhealthyDomains = dnsChecks.filter(
    (check) =>
      check.spfStatus !== "PASS" || check.dkimStatus !== "PASS" || check.dmarcStatus !== "PASS",
  );

  return NextResponse.json({
    inboxes: {
      total: inboxes.length,
      connected: inboxes.filter((inbox) => inbox.status === "CONNECTED").length,
      needingAttention: inboxes.filter((inbox) => inbox.status !== "CONNECTED"),
      dailySendCapacity: inboxes
        .filter((inbox) => inbox.status === "CONNECTED")
        .reduce((total, inbox) => total + inbox.dailySendLimit, 0),
    },
    dns: {
      checkedDomains: dnsChecks.length,
      unhealthyDomains,
    },
    campaigns: {
      total: campaigns.length,
      active: campaigns.filter((campaign) => campaign.status === "ACTIVE").length,
      byStatus: campaigns.reduce<Record<string, number>>((counts, campaign) => {
        counts[campaign.status] = (counts[campaign.status] ?? 0) + 1;
        return counts;
      }, {}),
      list: campaigns,
    },
    leads: { active: leadCount, suppressed: suppressionCount },
    conversationsNeedingReview,
    analytics: canViewAnalytics ? { replyRate, ...qualifiedMeetingRate } : null,
  });
}
