import { prisma } from "@mail-orbyt/database";
import {
  recordEmailOpen,
  TRANSPARENT_GIF,
  TRANSPARENT_GIF_CONTENT_TYPE,
} from "@mail-orbyt/tracking";
import { NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ outboxItemId: string }>;
}

/**
 * Serves the 1x1 open-tracking pixel. Always returns the same transparent
 * GIF with the same status regardless of whether the token resolves to a
 * real send, so a broken/expired link never shows a broken-image icon or
 * lets a client distinguish "valid token" from "invalid token" by response
 * shape. Recording the open must never block or fail the image response.
 */
export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { outboxItemId } = await params;

  try {
    await recordEmailOpen(prisma, outboxItemId, {
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });
  } catch {
    // Never let a DB error surface as a broken pixel response.
  }

  return new NextResponse(TRANSPARENT_GIF, {
    status: 200,
    headers: {
      "Content-Type": TRANSPARENT_GIF_CONTENT_TYPE,
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
    },
  });
}
