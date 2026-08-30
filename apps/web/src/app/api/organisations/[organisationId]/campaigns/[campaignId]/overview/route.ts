import { ForbiddenError, hasPermission, UnauthenticatedError } from "@mail-orbyt/authentication";
import { getQualifiedMeetingRate, getReplyRate } from "@mail-orbyt/analytics";
import { prisma } from "@mail-orbyt/database";
import { NextResponse } from "next/server";
import { authenticateOrganisationRequest } from "@/lib/api-auth";
import { getOrganisationCampaign } from "@/lib/campaigns";

interface RouteParams {
  params: Promise<{ organisationId: string; campaignId: string }>;
}

/**
 * Everything about one campaign in a single read: configuration, its ordered
 * steps, enrollment counts broken down by status, the sending inbox pool,
 * and the outcome metrics that actually matter. The piecewise equivalent is
 * four or five requests whose results the caller then has to join by hand.
 *
 * Inbox rows are field-picked rather than passed through — the Inbox model
 * carries encrypted OAuth tokens and must never leave the server whole.
 */
export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId, campaignId } = await params;

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

  const campaign = await getOrganisationCampaign(organisationId, campaignId);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const enrollmentsByStatus = campaign.enrollments.reduce<Record<string, number>>(
    (counts, enrollment) => {
      counts[enrollment.status] = (counts[enrollment.status] ?? 0) + 1;
      return counts;
    },
    {},
  );

  // Outcome metrics are a separately-permissioned surface (`/analytics`
  // requires `analytics:view`, which MEMBER does not hold). Bundling them
  // into an overview must not become a way around that, so a caller without
  // the permission gets the campaign's structure and no stats.
  const canViewAnalytics = hasPermission(membership.role, "analytics:view");

  const filter = { organisationId, campaignId };
  const [qualifiedMeetingRate, replyRate, sentCount] = canViewAnalytics
    ? await Promise.all([
        getQualifiedMeetingRate(prisma, filter),
        getReplyRate(prisma, filter),
        prisma.outboxItem.count({ where: { organisationId, campaignId, status: "SENT" } }),
      ])
    : [null, null, null];

  return NextResponse.json({
    campaign: {
      id: campaign.id,
      name: campaign.name,
      description: campaign.description,
      status: campaign.status,
      timezone: campaign.timezone,
      sendingDaysOfWeek: campaign.sendingDaysOfWeek,
      sendingWindowStartMinute: campaign.sendingWindowStartMinute,
      sendingWindowEndMinute: campaign.sendingWindowEndMinute,
      inboxCooldownMinutes: campaign.inboxCooldownMinutes,
      emailPromptInstructions: campaign.emailPromptInstructions,
      createdAt: campaign.createdAt,
    },
    steps: campaign.steps,
    inboxes: campaign.inboxes.map((entry) => ({
      id: entry.inbox.id,
      emailAddress: entry.inbox.emailAddress,
      displayName: entry.inbox.displayName,
      status: entry.inbox.status,
      dailySendLimit: entry.inbox.dailySendLimit,
    })),
    enrollments: {
      total: campaign.enrollments.length,
      byStatus: enrollmentsByStatus,
    },
    pendingSends: campaign.pendingSends,
    stats: canViewAnalytics ? { emailsSent: sentCount, replyRate, ...qualifiedMeetingRate } : null,
  });
}
