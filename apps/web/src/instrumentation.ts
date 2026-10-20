import { logger } from "@/lib/logger";

export async function onRequestError(
  error: { digest: string } & Error,
  request: { path: string; method: string },
  context: { routerKind: string; routePath: string; routeType: string },
): Promise<void> {
  const path = request.path.split("?")[0] ?? request.path;
  logger.error("request failed", {
    method: request.method,
    path,
    routePath: context.routePath,
    routerKind: context.routerKind,
    routeType: context.routeType,
    errorName: error.name,
    errorMessage: error.message,
    digest: error.digest,
  });
}
