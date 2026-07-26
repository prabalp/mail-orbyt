import { NextResponse } from "next/server";
import { prisma } from "@mail-orbyt/database";

/**
 * Readiness probe — verifies the database is reachable before the load
 * balancer routes traffic here. Redis connectivity is added once the queue
 * client lands in Phase 8.
 */
export async function GET(): Promise<NextResponse> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ready", database: "connected" });
  } catch (error) {
    return NextResponse.json(
      { status: "not_ready", database: "unreachable", error: (error as Error).message },
      { status: 503 },
    );
  }
}
