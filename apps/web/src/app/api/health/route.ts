import { NextResponse } from "next/server";

/**
 * Liveness probe — returns 200 as long as the process can handle requests.
 * Does not check downstream dependencies; see /api/ready for that.
 */
export function GET(): NextResponse {
  return NextResponse.json({ status: "ok" });
}
