import { ForbiddenError, UnauthenticatedError } from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import { emailSchema } from "@mail-orbyt/validation";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateOrganisationRequest } from "@/lib/api-auth";
import {
  CampaignActivationError,
  enrollCampaignLeads,
  enrollCampaignLeadsFromList,
  listCampaignEnrollments,
} from "@/lib/campaigns";

interface RouteParams {
  params: Promise<{ organisationId: string; campaignId: string }>;
}

const enrollSchema = z.union([
  z.object({ leadIds: z.array(z.string().min(1)).min(1) }),
  z.object({ leadListId: z.string().min(1) }),
  // Addressing leads by email is how a human (or an AI client acting for
  // one) actually refers to them — requiring a cuid first forces a lookup
  // round trip whose only purpose is to translate. Resolution happens
  // server-side and stays scoped to this organisation.
  z.object({ leadEmails: z.array(emailSchema).min(1).max(5000) }),
]);

export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId, campaignId } = await params;

  try {
    await authenticateOrganisationRequest(request, { organisationId });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const enrollments = await listCampaignEnrollments(organisationId, campaignId);
  if (!enrollments) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  return NextResponse.json({ enrollments });
}

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

  const body = enrollSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  try {
    return await enroll(organisationId, campaignId, body.data);
  } catch (error) {
    if (error instanceof CampaignActivationError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}

async function enroll(
  organisationId: string,
  campaignId: string,
  data: z.infer<typeof enrollSchema>,
): Promise<NextResponse> {
  if ("leadListId" in data) {
    const result = await enrollCampaignLeadsFromList(organisationId, campaignId, data.leadListId);
    return NextResponse.json(result, { status: 201 });
  }

  if ("leadEmails" in data) {
    const leads = await prisma.lead.findMany({
      where: { organisationId, email: { in: data.leadEmails } },
      select: { id: true, email: true },
    });

    // Report the addresses that matched nothing rather than silently
    // enrolling a subset — "enrolled: 3" when you asked for 5 is a bug the
    // caller cannot see.
    const found = new Set(leads.map((lead) => lead.email));
    const notFound = data.leadEmails.filter((email) => !found.has(email));

    if (leads.length === 0) {
      return NextResponse.json(
        { error: "No leads in this organisation match those email addresses", notFound },
        { status: 404 },
      );
    }

    const result = await enrollCampaignLeads(
      organisationId,
      campaignId,
      leads.map((lead) => lead.id),
    );
    return NextResponse.json({ ...result, notFound }, { status: 201 });
  }

  const result = await enrollCampaignLeads(organisationId, campaignId, data.leadIds);
  return NextResponse.json(result, { status: 201 });
}
