import type { ZodRawShape } from "zod";
import { loadEnv } from "@mail-orbyt/config";
import { scopeIncludes, PROFILE_SCOPE, type Permission } from "@mail-orbyt/mcp-oauth";
import type { AuthenticatedActor } from "../auth-middleware.js";

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/**
 * MCP tool annotations (see the spec's `ToolAnnotations`). These are HINTS a
 * client uses to decide what to auto-run and what to confirm with a human
 * first — a wrong `readOnlyHint` on a destructive tool is a real safety bug,
 * not a cosmetic one, so they're declared per descriptor rather than
 * inferred from the HTTP method (DELETE-by-id is idempotent and destructive;
 * POST /send-now is neither).
 */
export interface ToolAnnotations {
  /** The tool does not modify anything — every listing and single-record read. */
  readOnlyHint?: boolean;
  /** The tool can perform irreversible destruction (hard delete, revoke, purge). */
  destructiveHint?: boolean;
  /** Calling it twice with the same arguments has the same effect as calling it once. */
  idempotentHint?: boolean;
  /**
   * Whether the tool touches an open world of external entities. Always
   * false here: every tool acts on this organisation's own records.
   */
  openWorldHint?: boolean;
}

/**
 * A tolerant output schema: an all-optional, passthrough shape. Structured
 * output is validated by the SDK and a mismatch fails the whole call, so
 * these describe the fields a client can RELY on rather than exhaustively
 * typing the REST payload — a new field appearing upstream must never break
 * an existing tool.
 */
export type OutputShape = ZodRawShape;

export interface RouteToolDescriptor {
  /** MCP tool name — snake_case, matches the action a user would ask for. */
  name: string;
  /** Human-readable label for client UIs, e.g. "List leads". */
  title?: string;
  description: string;
  method: HttpMethod;
  /** e.g. "/api/organisations/{organisationId}/leads/{leadId}" — every path param besides organisationId must also be a key in inputShape. */
  pathTemplate: string;
  /** organisationId is injected automatically from the access token and must NOT be included here. */
  inputShape: ZodRawShape;
  /** A Permission string (see packages/authentication) or "profile" for membership-only routes. Enforced both here (fail fast, no network round-trip) and again by apps/web's own scope check. */
  requiredScope: Permission | typeof PROFILE_SCOPE;
  /** Set for the one multipart/form-data upload endpoint (CSV import preview) — input fields `fileName` and `fileContentBase64` are sent as a file part instead of JSON. */
  encode?: "json" | "multipart";
  annotations?: ToolAnnotations;
  /** Declare for reads whose payload is a JSON object — see OutputShape. */
  outputShape?: OutputShape;
}

function pathParamNames(template: string): string[] {
  const names: string[] = [];
  for (const match of template.matchAll(/\{(\w+)\}/g)) {
    if (match[1]) names.push(match[1]);
  }
  return names;
}

export class ToolScopeError extends Error {
  constructor(requiredScope: string) {
    super(`This connection was not granted the "${requiredScope}" permission.`);
    this.name = "ToolScopeError";
  }
}

/**
 * An upstream failure, normalized. `retryable` separates "try again in a
 * moment" (5xx, network) from "this call will never work as written" (4xx) —
 * without it a model retries a 400 forever and gives up on a 503.
 */
export class ToolRequestError extends Error {
  readonly status: number;
  readonly retryable: boolean;

  constructor(message: string, status: number, retryable: boolean) {
    super(message);
    this.name = "ToolRequestError";
    this.status = status;
    this.retryable = retryable;
  }
}

/**
 * apps/web returns `{ error, details? }` where `details` is a flattened Zod
 * error. Surfacing the field-level detail is the difference between a model
 * fixing its arguments and a model guessing at what "Invalid request" meant.
 */
function describeUpstreamFailure(
  status: number,
  statusText: string,
  body: string,
): { detail: string; isSpecific: boolean } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { detail: body.slice(0, 500) || statusText, isSpecific: body.length > 0 };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { detail: body.slice(0, 500), isSpecific: false };
  }

  const { error, details } = parsed as { error?: unknown; details?: unknown };
  // apps/web's own error strings ("That user is not a member of this
  // organisation") are far more precise than anything this layer can infer
  // from a status code — treat their presence as authoritative.
  const isSpecific = typeof error === "string" && error.length > 0;
  const headline = isSpecific ? (error as string) : statusText;
  if (details === undefined) return { detail: headline, isSpecific };

  return { detail: `${headline}: ${JSON.stringify(details).slice(0, 800)}`, isSpecific };
}

function toolRequestError(toolName: string, response: Response, body: string): ToolRequestError {
  const { detail, isSpecific } = describeUpstreamFailure(
    response.status,
    response.statusText,
    body,
  );
  const retryable = response.status >= 500 || response.status === 429;

  // Only guess at the cause when apps/web didn't say. Appending "this
  // connection lacks the permission" to a 403 that already read "That user
  // is not a member of this organisation" doesn't just add noise — it
  // contradicts the real reason and points a reader at re-authenticating
  // when the actual fix is to pass a different userId.
  const guidance =
    response.status === 401
      ? " The connection's access token is no longer valid — reconnect the Mail Orbyt integration."
      : isSpecific
        ? ""
        : response.status === 403
          ? " This connection lacks the permission for that action, or the record belongs to another organisation."
          : response.status === 404
            ? " Check the id — it may have been deleted, or belong to a different organisation."
            : retryable
              ? " This is a temporary failure; retrying is reasonable."
              : "";

  return new ToolRequestError(
    `${toolName} failed (HTTP ${response.status}): ${detail}.${guidance}`,
    response.status,
    retryable,
  );
}

/**
 * Turns a route descriptor into an MCP tool handler: fills the path
 * template, routes the remaining input fields to a query string (GET) or a
 * JSON/multipart body (everything else), and forwards the call to
 * apps/web's own REST API using the caller's own access token — the same
 * Zod validation and `requireOrganisationMembership`/scope checks apps/web
 * already applies to the web UI apply here too, so this function never
 * duplicates that logic.
 */
export function buildToolHandler(descriptor: RouteToolDescriptor) {
  return async (input: Record<string, unknown>, actor: AuthenticatedActor): Promise<string> => {
    if (!scopeIncludes(actor.scope, descriptor.requiredScope)) {
      throw new ToolScopeError(descriptor.requiredScope);
    }

    const appUrl = loadEnv().APP_URL;
    const remaining: Record<string, unknown> = { ...input };
    // organisationId always comes from the actor's own token, never from
    // input — no descriptor may declare it in inputShape (enforced by
    // registry.test.ts), so the MCP SDK's schema validation already strips
    // an input field by that name before this handler ever runs. Deleting
    // it here too is defense in depth: it must never leak into the upstream
    // request (as a query param on a GET, say) through any other call path.
    delete remaining.organisationId;

    let path = descriptor.pathTemplate.replace("{organisationId}", actor.organisationId);
    for (const name of pathParamNames(descriptor.pathTemplate)) {
      if (name === "organisationId") continue;
      path = path.replace(`{${name}}`, encodeURIComponent(String(remaining[name])));
      delete remaining[name];
    }

    let url = `${appUrl}${path}`;
    const headers: Record<string, string> = { Authorization: `Bearer ${actor.rawToken}` };
    const init: RequestInit = { method: descriptor.method, headers };

    if (descriptor.encode === "multipart") {
      const { fileName, fileContentBase64, ...rest } = remaining as {
        fileName: string;
        fileContentBase64: string;
      };
      void rest;
      const form = new FormData();
      form.append("file", new Blob([Buffer.from(fileContentBase64, "base64")]), fileName);
      init.body = form;
    } else if (descriptor.method === "GET") {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(remaining)) {
        if (value === undefined || value === null) continue;
        query.set(key, String(value));
      }
      const queryString = query.toString();
      if (queryString) url += `?${queryString}`;
    } else {
      // Always send a JSON body for non-GET, non-multipart methods — even
      // an empty `{}` — rather than only when there's at least one field.
      // A tool whose inputShape is entirely optional fields legitimately
      // gets called with no arguments at all; the apps/web route on the
      // other end still does `await request.json()` and parses the result
      // against a Zod object schema. No body at all makes `request.json()`
      // fail (there's nothing to parse), which every route catches as
      // `null` — and `z.object({...}).safeParse(null)` rejects null even
      // when every one of its fields is optional, since null isn't an
      // object. Sending `{}` keeps that parse succeeding the way an
      // explicit empty JSON body from any other client already would.
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(remaining);
    }

    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (error) {
      // A transport-level failure (apps/web down, DNS, socket reset) is
      // always worth retrying — distinguish it from a 4xx the same way.
      const message = error instanceof Error ? error.message : String(error);
      throw new ToolRequestError(
        `${descriptor.name} could not reach Mail Orbyt: ${message}`,
        0,
        true,
      );
    }

    const text = await response.text();
    if (!response.ok) {
      throw toolRequestError(descriptor.name, response, text);
    }
    return text || "{}";
  };
}

/**
 * For actions that can't be completed via a REST round-trip — e.g. starting
 * an external OAuth flow (connecting a Gmail inbox) that only a human,
 * finishing it in their own browser, can actually complete. Rather than
 * calling apps/web, the descriptor computes its result directly from the
 * actor (and whatever input it declares).
 */
export interface LinkToolDescriptor {
  name: string;
  title?: string;
  description: string;
  inputShape: ZodRawShape;
  requiredScope: Permission | typeof PROFILE_SCOPE;
  annotations?: ToolAnnotations;
  outputShape?: OutputShape;
  buildResult: (
    input: Record<string, unknown>,
    actor: AuthenticatedActor,
  ) => string | Promise<string>;
}

export function buildLinkToolHandler(descriptor: LinkToolDescriptor) {
  return async (input: Record<string, unknown>, actor: AuthenticatedActor): Promise<string> => {
    if (!scopeIncludes(actor.scope, descriptor.requiredScope)) {
      throw new ToolScopeError(descriptor.requiredScope);
    }
    return descriptor.buildResult(input, actor);
  };
}
