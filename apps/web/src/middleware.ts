import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";

const QUIET_PATHS = new Set(["/api/health", "/api/ready"]);

export function middleware(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("x-request-id", requestId);

  const path = request.nextUrl.pathname;
  if (!QUIET_PATHS.has(path)) {
    logger.info("request", {
      requestId,
      method: request.method,
      path,
    });
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
