import { ForbiddenError, UnauthenticatedError } from "@mail-orbyt/authentication";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateOrganisationRequest } from "@/lib/api-auth";
import {
  addCampaignStep,
  archiveOrganisationCampaign,
  CampaignActivationError,
  createOrganisationCampaign,
  enrollCampaignLeads,
  enrollCampaignLeadsFromList,
  getOrganisationCampaign,
  InvalidInboxPoolError,
  InvalidStepError,
  setCampaignInboxPool,
  updateOrganisationCampaign,
} from "@/lib/campaigns";

interface RouteParams {
  params: Promise<{ organisationId: string }>;
}

const stepSchema = z.object({
  stepType: z.enum(["INITIAL", "FOLLOW_UP", "CLOSE_THE_LOOP"]),
  delayDays: z.number().int().min(0).max(60).optional(),
  useAiGeneration: z.boolean().optional(),
  useImportedContent: z.boolean().optional(),
  callToActionOverride: z.string().max(300).optional(),
  manualSubject: z.string().max(150).nullable().optional(),
  manualBody: z.string().max(4000).nullable().optional(),
});

const bodySchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  timezone: z.string().optional(),
  sendingDaysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  sendingWindowStartMinute: z.number().int().min(0).max(1439).optional(),
  sendingWindowEndMinute: z.number().int().min(0).max(1439).optional(),
  inboxCooldownMinutes: z.number().int().min(0).max(180).optional(),
  emailPromptInstructions: z.string().max(4000).optional(),
  /** JOURNEY follows each lead's imported email graph; steps are then optional (one placeholder step is created). */
  routingMode: z.enum(["LINEAR", "JOURNEY"]).optional(),
  /** Ordered — steps are created in array order, which becomes their orderIndex. */
  steps: z.array(stepSchema).max(20).optional(),
  inboxIds: z.array(z.string().min(1)).optional(),
  leadListId: z.string().min(1).optional(),
  leadIds: z.array(z.string().min(1)).min(1).max(50000).optional(),
  /** Activate immediately. Requires at least one step and one inbox, which is why it happens last. */
  activate: z.boolean().optional(),
});

/**
 * Assembles a whole campaign in one call: create, add the ordered steps, set
 * the sending inbox pool, optionally enroll leads, optionally activate.
 *
 * This exists because the piecewise API (POST campaign, POST step xN, PUT
 * inboxes, POST enrollments, PATCH status) is five-plus round trips where
 * every intermediate failure leaves a half-built campaign the caller then has
 * to reason about. The underlying services are not transactional across
 * calls, so this route takes responsibility for that instead: any failure
 * after the campaign row exists ARCHIVES it before returning the error, so a
 * failed assembly never leaves a partial campaign sitting in the user's list.
 */
export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId } = await params;

  let userId: string;
  try {
    ({ userId } = await authenticateOrganisationRequest(request, {
      organisationId,
      permission: "campaigns:manage",
    }));
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const {
    steps: requestedSteps,
    inboxIds,
    leadListId,
    leadIds,
    activate,
    ...campaignFields
  } = parsed.data;

  const isJourney = campaignFields.routingMode === "JOURNEY";
  const steps = isJourney
    ? [{ stepType: "INITIAL" as const, useAiGeneration: false, useImportedContent: true }]
    : requestedSteps;
  if (!steps?.length) {
    return NextResponse.json(
      { error: "A linear campaign needs at least one step" },
      { status: 400 },
    );
  }
  if (isJourney && requestedSteps?.length) {
    return NextResponse.json(
      {
        error: "A journey campaign takes no steps; its emails come from each lead's imported graph",
      },
      { status: 400 },
    );
  }

  if (leadListId && leadIds) {
    return NextResponse.json(
      { error: "Provide either leadListId or leadIds, not both" },
      { status: 400 },
    );
  }

  const campaign = await createOrganisationCampaign({
    organisationId,
    createdByUserId: userId,
    ...campaignFields,
  });

  try {
    for (const step of steps) {
      const created = await addCampaignStep(organisationId, campaign.id, step);
      if (!created) {
        throw new Error("Campaign disappeared while its steps were being added.");
      }
    }

    if (inboxIds?.length) {
      const pool = await setCampaignInboxPool(organisationId, campaign.id, inboxIds);
      if (!pool) {
        throw new Error("Campaign disappeared while its inbox pool was being set.");
      }
    }

    const enrollment = leadListId
      ? await enrollCampaignLeadsFromList(organisationId, campaign.id, leadListId)
      : leadIds
        ? await enrollCampaignLeads(organisationId, campaign.id, leadIds)
        : null;

    if (activate) {
      // Deliberately last: activation validates that steps and inboxes exist,
      // so it can only succeed once everything above has landed.
      await updateOrganisationCampaign(
        organisationId,
        campaign.id,
        { status: "ACTIVE" },
        { userId },
      );
    }

    const assembled = await getOrganisationCampaign(organisationId, campaign.id);
    return NextResponse.json({ campaign: assembled, enrollment }, { status: 201 });
  } catch (error) {
    // Roll back to the closest thing this schema has to "never existed".
    // Archiving rather than deleting keeps the audit trail intact while
    // getting the failed campaign out of every list the user sees.
    await archiveOrganisationCampaign(organisationId, campaign.id).catch(() => undefined);

    if (error instanceof CampaignActivationError || error instanceof InvalidStepError) {
      return NextResponse.json(
        { error: error.message, rolledBack: true },
        { status: error instanceof CampaignActivationError ? 409 : 400 },
      );
    }
    if (error instanceof InvalidInboxPoolError) {
      return NextResponse.json({ error: error.message, rolledBack: true }, { status: 400 });
    }
    throw error;
  }
}
