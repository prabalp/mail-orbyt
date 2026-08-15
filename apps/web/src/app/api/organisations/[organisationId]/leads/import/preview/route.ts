import { randomUUID } from "node:crypto";
import { ForbiddenError, UnauthenticatedError } from "@mail-orbyt/authentication";
import { previewImport } from "@mail-orbyt/leads";
import { NextResponse } from "next/server";
import { authenticateOrganisationRequest } from "@/lib/api-auth";
import { objectStorage } from "@/lib/storage";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

interface RouteParams {
  params: Promise<{ organisationId: string }>;
}

/**
 * Uploads the CSV to object storage immediately (under a temp key) and
 * returns a preview — headers, suggested column mapping, row count, and the
 * first 20 rows with validation errors. No Lead/ImportBatch rows are
 * created here; that only happens once the user confirms (see
 * leads/import/route.ts), which references this same storageKey so the
 * file is never uploaded twice.
 */
export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId } = await params;

  try {
    await authenticateOrganisationRequest(request, {
      organisationId,
      permission: "leads:manage",
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "The uploaded file is empty" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File exceeds the 10 MB upload limit" }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv") {
    return NextResponse.json({ error: "Only CSV files are supported" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storageKey = `imports/${organisationId}/${randomUUID()}.csv`;
  await objectStorage.putObject({ key: storageKey, body: buffer, contentType: "text/csv" });

  let preview;
  try {
    preview = await previewImport(buffer);
  } catch {
    return NextResponse.json({ error: "Could not parse this file as CSV" }, { status: 400 });
  }

  return NextResponse.json({
    storageKey,
    fileName: file.name,
    headers: preview.headers,
    suggestedMapping: preview.suggestedMapping,
    totalRowCount: preview.totalRowCount,
    previewRows: preview.previewRows,
  });
}
