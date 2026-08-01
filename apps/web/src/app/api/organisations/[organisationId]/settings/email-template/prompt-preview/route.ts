import { ForbiddenError, requireOrganisationMembership } from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import { buildGenerateEmailPrompt } from "@mail-orbyt/email-generation";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ organisationId: string }>;
}

const bodySchema = z.object({
  customInstructions: z.string().max(2000).optional(),
  calendlyUrl: z.union([z.string().url(), z.literal("")]).optional(),
});

/**
 * Renders the EXACT real prompt (same buildGenerateEmailPrompt the actual
 * generation pipeline uses) against representative sample data, so a user
 * can see precisely what the AI receives — including their own in-progress
 * (not-yet-saved) custom instructions and booking link — without needing a
 * real lead or a real AI call.
 */
export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const { organisationId } = await params;

  try {
    await requireOrganisationMembership(prisma, { userId: session.user.id, organisationId });
  } catch (error) {
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const prompt = buildGenerateEmailPrompt({
    generationType: "INITIAL",
    leadFirstName: "Jamie",
    leadTitle: "VP Sales",
    companyName: "Acme Inc",
    senderName: "Alex Rivera",
    senderCompanyName: "Your Company",
    callToAction: "book a 15 minute intro call",
    facts: [
      {
        category: "company_description",
        value: "Builds developer tools for platform teams.",
        sourceUrl: "https://acme.example/",
      },
      { category: "awards", value: "Best Places to Work 2025", sourceUrl: "https://acme.example/" },
    ],
    websiteText:
      "(example) Acme Inc | Developer tools for platform teams. We help engineering orgs ship faster with less toil...",
    customInstructions: parsed.data.customInstructions || undefined,
    bookingLink: parsed.data.calendlyUrl || undefined,
  });

  return NextResponse.json(prompt);
}
