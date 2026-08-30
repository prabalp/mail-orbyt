import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PROFILE_SCOPE } from "@mail-orbyt/mcp-oauth";
import { ALL_LINK_TOOLS, ALL_TOOLS } from "./index";
import type { RouteToolDescriptor } from "./registry";

const VALID_PERMISSIONS = new Set<string>([
  "billing:manage",
  "organisation:delete",
  "organisation:transfer_ownership",
  "members:manage",
  "campaigns:manage",
  "inboxes:manage",
  "leads:manage",
  "research:review",
  "conversations:review",
  "analytics:view",
  PROFILE_SCOPE,
]);

const HERE = path.dirname(fileURLToPath(import.meta.url));
// apps/mcp-server/src/tools -> apps/web/src/app/api
const WEB_API_ROOT = path.resolve(HERE, "../../../web/src/app/api");

function pathParamNames(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!);
}

/**
 * Turns a descriptor's pathTemplate into the Next.js route file it must
 * resolve to — `{leadId}` segments become `[leadId]` directory segments,
 * mirroring how apps/mcp-server's own registry.ts fills them at call time.
 */
function routeFileFor(pathTemplate: string): string {
  const withoutApiPrefix = pathTemplate.replace(/^\/api\//, "");
  const segments = withoutApiPrefix
    .split("/")
    .map((segment) => segment.replace(/\{(\w+)\}/g, "[$1]"));
  return path.join(WEB_API_ROOT, ...segments, "route.ts");
}

describe("tool descriptor integrity", () => {
  const allNamed = [...ALL_TOOLS, ...ALL_LINK_TOOLS];

  it("has no duplicate tool names", () => {
    const seen = new Map<string, number>();
    for (const descriptor of allNamed) {
      seen.set(descriptor.name, (seen.get(descriptor.name) ?? 0) + 1);
    }
    const duplicates = [...seen.entries()].filter(([, count]) => count > 1).map(([name]) => name);
    expect(duplicates).toEqual([]);
  });

  it("every tool name is snake_case", () => {
    const offenders = allNamed.filter(
      (descriptor) => !/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(descriptor.name),
    );
    expect(offenders.map((descriptor) => descriptor.name)).toEqual([]);
  });

  it("every requiredScope is a real permission or the profile scope", () => {
    const offenders = allNamed.filter(
      (descriptor) => !VALID_PERMISSIONS.has(descriptor.requiredScope),
    );
    expect(
      offenders.map((descriptor) => `${descriptor.name}: ${descriptor.requiredScope}`),
    ).toEqual([]);
  });

  it("route descriptors resolve to a real apps/web route file", () => {
    const missing = ALL_TOOLS.filter(
      (descriptor) => !existsSync(routeFileFor(descriptor.pathTemplate)),
    ).map((descriptor) => `${descriptor.name} -> ${descriptor.pathTemplate}`);
    expect(missing).toEqual([]);
  });

  it("every non-organisationId path param appears in inputShape", () => {
    const offenders: string[] = [];
    for (const descriptor of ALL_TOOLS as RouteToolDescriptor[]) {
      const params = pathParamNames(descriptor.pathTemplate).filter(
        (name) => name !== "organisationId",
      );
      const missing = params.filter((name) => !(name in descriptor.inputShape));
      if (missing.length > 0) {
        offenders.push(`${descriptor.name}: missing ${missing.join(", ")}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("inputShape never declares organisationId — it is injected from the token", () => {
    const offenders = ALL_TOOLS.filter(
      (descriptor) => "organisationId" in descriptor.inputShape,
    ).map((descriptor) => descriptor.name);
    expect(offenders).toEqual([]);
  });

  it("multipart descriptors declare fileName and fileContentBase64", () => {
    const offenders = ALL_TOOLS.filter(
      (descriptor) =>
        descriptor.encode === "multipart" &&
        (!("fileName" in descriptor.inputShape) || !("fileContentBase64" in descriptor.inputShape)),
    ).map((descriptor) => descriptor.name);
    expect(offenders).toEqual([]);
  });

  it("every descriptor has a non-empty description", () => {
    const offenders = allNamed.filter((descriptor) => descriptor.description.trim().length === 0);
    expect(offenders.map((descriptor) => descriptor.name)).toEqual([]);
  });
});
