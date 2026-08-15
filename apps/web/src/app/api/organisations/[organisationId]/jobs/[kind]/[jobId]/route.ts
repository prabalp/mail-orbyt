import { ForbiddenError, UnauthenticatedError } from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateOrganisationRequest } from "@/lib/api-auth";

interface RouteParams {
  params: Promise<{ organisationId: string; kind: string; jobId: string }>;
}

const kindSchema = z.enum(["research", "import", "keywords"]);

/** The shape every job kind is normalized to, so a caller polls one way regardless of what it started. */
interface JobStatus {
  kind: z.infer<typeof kindSchema>;
  id: string;
  /** PENDING | RUNNING | COMPLETED | FAILED — normalized across the three underlying status enums. */
  state: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  done: boolean;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  progress?: Record<string, number>;
}

/**
 * One place to ask "is that finished yet?".
 *
 * Research, keyword extraction, and CSV import are all queued and all
 * previously reported progress through a different route with a different
 * status enum and a different id — so an assistant that kicked off work had
 * to know three polling protocols. This normalizes them onto one.
 *
 * `kind` is part of the path rather than inferred from the id: these ids
 * come from separate tables and could collide, and guessing which table an
 * opaque cuid belongs to by trying each in turn is exactly how one tenant's
 * id becomes a probe against another table.
 */
export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId, kind: rawKind, jobId } = await params;

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

  const kind = kindSchema.safeParse(rawKind);
  if (!kind.success) {
    return NextResponse.json(
      { error: "Unknown job kind — expected one of: research, import, keywords" },
      { status: 400 },
    );
  }

  const status = await loadJobStatus(kind.data, organisationId, jobId);
  if (!status) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json(status);
}

async function loadJobStatus(
  kind: z.infer<typeof kindSchema>,
  organisationId: string,
  jobId: string,
): Promise<JobStatus | null> {
  if (kind === "research") {
    const job = await prisma.researchJob.findFirst({
      where: { id: jobId, organisationId },
    });
    if (!job) return null;
    return {
      kind,
      id: job.id,
      state: job.status,
      done: job.status === "COMPLETED" || job.status === "FAILED",
      errorMessage: job.errorMessage,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    };
  }

  if (kind === "import") {
    const batch = await prisma.importBatch.findFirst({
      where: { id: jobId, organisationId },
    });
    if (!batch) return null;
    return {
      kind,
      id: batch.id,
      // ImportBatchStatus uses PROCESSING where the others use RUNNING.
      state: batch.status === "PROCESSING" ? "RUNNING" : batch.status,
      done: batch.status === "COMPLETED" || batch.status === "FAILED",
      errorMessage: batch.errorMessage,
      startedAt: null,
      completedAt: null,
      progress: {
        totalRows: batch.totalRows,
        imported: batch.importedCount,
        skipped: batch.skippedCount,
        errors: batch.errorCount,
      },
    };
  }

  // Keyword extraction is keyed by researchSourceId rather than a run id —
  // the run row is created by the worker, so the caller never sees one at
  // kickoff time (see the keywords route's `{ researchSourceId }` response).
  const run = await prisma.researchKeywordRun.findFirst({
    where: { researchSourceId: jobId, organisationId },
    orderBy: { createdAt: "desc" },
  });
  if (!run) return null;

  // ResearchProviderRunStatus is the third and least-aligned of the status
  // enums: SUCCEEDED rather than COMPLETED, plus a SKIPPED_NOT_CONFIGURED
  // terminal state that means "nothing to do here" — both are `done` as far
  // as a caller polling for completion is concerned.
  const state =
    run.status === "SUCCEEDED" || run.status === "SKIPPED_NOT_CONFIGURED"
      ? "COMPLETED"
      : run.status;

  return {
    kind,
    id: run.researchSourceId,
    state,
    done: state === "COMPLETED" || state === "FAILED",
    errorMessage:
      run.status === "SKIPPED_NOT_CONFIGURED"
        ? "Keyword extraction is not configured for this organisation."
        : run.errorMessage,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
  };
}
