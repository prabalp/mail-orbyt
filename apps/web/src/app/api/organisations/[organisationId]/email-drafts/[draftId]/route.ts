import { ForbiddenError, requireOrganisationMembership } from "@mail-orbyt/authentication";
import {
  AiGenerationFailedError,
  AiNotConfiguredError,
  GeneratedEmailValidationError,
} from "@mail-orbyt/email-generation";
import { prisma } from "@mail-orbyt/database";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { rewriteDraft, setDraftStatus } from "@/lib/email-drafts";

interface RouteParams {
  params: Promise<{ organisationId: string; draftId: string }>;
}

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("discard") }),
  z.object({ action: z.literal("rewrite"), style: z.enum(["SHORTER", "FORMAL", "DIRECT"]) }),
]);

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const { organisationId, draftId } = await params;

  try {
    await requireOrganisationMembership(prisma, {
      userId: session.user.id,
      organisationId,
      permission: "campaigns:manage",
    });
  } catch (error) {
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const draft = await prisma.emailDraft.findUnique({ where: { id: draftId } });
  if (!draft || draft.organisationId !== organisationId) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  const body = patchSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  try {
    if (body.data.action === "approve") {
      const updated = await setDraftStatus(organisationId, draftId, "APPROVED");
      return NextResponse.json(updated);
    }
    if (body.data.action === "discard") {
      const updated = await setDraftStatus(organisationId, draftId, "DISCARDED");
      return NextResponse.json(updated);
    }
    const rewritten = await rewriteDraft({
      organisationId,
      draftId,
      style: body.data.style,
      createdByUserId: session.user.id,
    });
    return NextResponse.json(rewritten, { status: 201 });
  } catch (error) {
    if (error instanceof AiNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof GeneratedEmailValidationError) {
      return NextResponse.json(
        { error: "Rewrite failed safety checks, please try again.", violations: error.violations },
        { status: 502 },
      );
    }
    if (error instanceof AiGenerationFailedError) {
      return NextResponse.json(
        { error: "The AI provider request failed. Please try again." },
        { status: 502 },
      );
    }
    throw error;
  }
}
