import { ForbiddenError, UnauthenticatedError } from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateOrganisationRequest } from "@/lib/api-auth";
import { enrollCampaignLeads } from "@/lib/campaigns";
import { listOrganisationRetargetableLeads } from "@/lib/conversations";

interface RouteParams {
  params: Promise<{ organisationId: string; campaignId: string }>;
}

const bodySchema = z.object({
  dryRun: z.boolean().optional(),
});

/**
 * Enrolls the organisation's retargetable pool into THIS campaign — the
 * action that always followed a read of `retargetable-leads`, which until
 * now meant carrying a list of lead ids between two calls by hand.
 *
 * `campaignId` is the campaign being enrolled INTO, matching the GET on the
 * same path: the pool is organisation-wide (everyone who finished a full
 * sequence without replying and isn't mid-sequence elsewhere), minus anyone
 * already enrolled here.
 *
 * The pool is recomputed rather than accepted from the client — a list of
 * ids posted back can be stale, and the same predicate that produced the
 * preview must produce the action.
 */
export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId, campaignId } = await params;

  try {
    await authenticateOrganisationRequest(request, {
      organisationId,
      permission: "campaigns:manage",
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const json = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Without this check, a nonexistent (or wrong-organisation) campaignId
  // silently behaves as "the pool minus nothing" — listOrganisationRetargetableLeads
  // only uses campaignId to EXCLUDE already-enrolled leads, so a bad id
  // just excludes nobody rather than failing. A dry run would report a
  // plausible-looking count for a campaign that doesn't exist, and a real
  // enrollment call would only fail downstream inside enrollCampaignLeads
  // with a generic uncaught Error (500) instead of a clean 404.
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.organisationId !== organisationId) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const leads = await listOrganisationRetargetableLeads(organisationId, campaignId);

  if (parsed.data.dryRun) {
    return NextResponse.json({
      dryRun: true,
      wouldEnroll: leads.length,
      leads: leads.map((lead) => ({ id: lead.id, email: lead.email })),
    });
  }

  if (leads.length === 0) {
    return NextResponse.json({ enrolled: 0, alreadyEnrolled: 0, suppressed: 0 });
  }

  const result = await enrollCampaignLeads(
    organisationId,
    campaignId,
    leads.map((lead) => lead.id),
  );

  return NextResponse.json(result, { status: 201 });
}
