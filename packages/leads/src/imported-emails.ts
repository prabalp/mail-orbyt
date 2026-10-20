import { z } from "zod";

export const IMPORTED_EMAIL_TYPES = ["INITIAL", "FOLLOW_UP", "CLOSE_THE_LOOP"] as const;
export const MAX_IMPORTED_EMAILS = 10;
export const MAX_JOURNEY_NODES = 20;
export const MAX_EDGE_DELAY_DAYS = 60;
/** The reserved edge target that ends the journey. */
export const JOURNEY_END = "END";

export type ImportedEmailType = (typeof IMPORTED_EMAIL_TYPES)[number];

export interface JourneyEdge {
  to: string;
  afterDays?: number;
  /** Plain-language description of when this outcome applies — shown to the decider model. */
  when?: string;
}

export interface ImportedEmail {
  sequence: number;
  emailType: ImportedEmailType;
  subject: string;
  body: string;
  /** Journey graph fields — absent on plain linear imports. */
  nodeKey?: string;
  isStart?: boolean;
  edges?: Record<string, JourneyEdge>;
}

const importedEmailSchema = z.object({
  sequence: z.number().int().positive(),
  type: z.enum(IMPORTED_EMAIL_TYPES),
  subject: z.string().trim().min(1).max(150),
  body: z.string().trim().min(1).max(4000),
});

const NODE_KEY = /^[A-Za-z0-9_-]{1,40}$/;
const OUTCOME_KEY = /^[a-z0-9_]{1,40}$/;

const journeyEdgeSchema = z.union([
  z.string().trim().min(1),
  z.object({
    to: z.string().trim().min(1),
    afterDays: z.number().int().min(0).max(MAX_EDGE_DELAY_DAYS).optional(),
    when: z.string().trim().min(1).max(300).optional(),
  }),
]);

const journeyNodeSchema = z.object({
  subject: z.string().trim().min(1).max(150),
  body: z.string().trim().min(1).max(4000),
  next: z.record(z.string(), journeyEdgeSchema).optional(),
});

const journeySchema = z.object({
  start: z.string().trim().min(1),
  emails: z.record(z.string(), journeyNodeSchema),
});

/**
 * Parses the object form of the `emails` column: a graph of emails where each
 * node's `next` maps an outcome label to the node to send next. The start node
 * gets sequence 1 so the linear coverage checks (a step's imported email is
 * sequence = orderIndex + 1) keep working for the single journey step.
 */
function parseJourney(parsed: unknown, count: number): ParsedImportedEmails {
  const result = journeySchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map(
        (issue) => `emails.${issue.path.join(".")}: ${issue.message}`,
      ),
    };
  }
  const { start, emails: nodes } = result.data;
  const keys = Object.keys(nodes);
  const errors: string[] = [];

  if (keys.length !== count) {
    errors.push(`emails has ${keys.length} node(s) but total_mails is ${count}`);
  }
  if (keys.length > MAX_JOURNEY_NODES) {
    errors.push(`a journey can have at most ${MAX_JOURNEY_NODES} emails`);
  }
  for (const key of keys) {
    if (!NODE_KEY.test(key)) errors.push(`node "${key}": ids use letters, digits, _ or - (max 40)`);
    if (key === JOURNEY_END) errors.push(`node id "${JOURNEY_END}" is reserved`);
  }
  if (!nodes[start]) errors.push(`start "${start}" is not one of the emails`);

  const edgesByNode = new Map<string, Record<string, JourneyEdge>>();
  for (const key of keys) {
    const edges: Record<string, JourneyEdge> = {};
    for (const [outcome, raw] of Object.entries(nodes[key]?.next ?? {})) {
      if (!OUTCOME_KEY.test(outcome)) {
        errors.push(`node "${key}": outcome "${outcome}" must be lowercase letters, digits or _`);
        continue;
      }
      const edge = typeof raw === "string" ? { to: raw } : raw;
      if (edge.to !== JOURNEY_END && !nodes[edge.to]) {
        errors.push(`node "${key}": outcome "${outcome}" points to unknown node "${edge.to}"`);
        continue;
      }
      const normalised: JourneyEdge = { to: edge.to };
      if (edge.afterDays !== undefined) normalised.afterDays = edge.afterDays;
      if ("when" in edge && edge.when !== undefined) normalised.when = edge.when;
      edges[outcome] = normalised;
    }
    edgesByNode.set(key, edges);
  }
  if (errors.length > 0) return { ok: false, errors };

  // Order by first reach from start so sequence 1 is the start node and every
  // node is reachable — an unreachable email is almost certainly a typo.
  const order: string[] = [];
  const queue = [start];
  while (queue.length > 0) {
    const key = queue.shift() as string;
    if (order.includes(key)) continue;
    order.push(key);
    for (const edge of Object.values(edgesByNode.get(key) ?? {})) {
      if (edge.to !== JOURNEY_END) queue.push(edge.to);
    }
  }
  const unreachable = keys.filter((key) => !order.includes(key));
  if (unreachable.length > 0) {
    return {
      ok: false,
      errors: [`emails not reachable from start: ${unreachable.join(", ")}`],
    };
  }

  return {
    ok: true,
    emails: order.map((key, index) => ({
      sequence: index + 1,
      emailType: key === start ? "INITIAL" : "FOLLOW_UP",
      subject: nodes[key]?.subject as string,
      body: nodes[key]?.body as string,
      nodeKey: key,
      isStart: key === start,
      edges: edgesByNode.get(key),
    })),
  };
}

export type ParsedImportedEmails =
  { ok: true; emails: ImportedEmail[] } | { ok: false; errors: string[] };

/**
 * Parses the optional CSV pair `total_mails` + `emails`. `emails` is either a
 * JSON array of { sequence, type, subject, body } (linear), or a journey
 * object { start, emails: { id: { subject, body, next } } }. Both columns must be present
 * together, and total_mails must equal the array length.
 */
export function parseImportedEmails(
  totalMails: string | undefined,
  emailsJson: string | undefined,
): ParsedImportedEmails {
  const countText = totalMails?.trim();
  const jsonText = emailsJson?.trim();
  if (!countText && !jsonText) return { ok: true, emails: [] };
  if (!countText || !jsonText) {
    return {
      ok: false,
      errors: ["total_mails and emails must both be present when either is set"],
    };
  }

  const count = Number(countText);
  if (
    !Number.isInteger(count) ||
    String(count) !== countText ||
    count < 1 ||
    count > MAX_JOURNEY_NODES
  ) {
    return {
      ok: false,
      errors: [`total_mails must be a whole number from 1 to ${MAX_JOURNEY_NODES}`],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false, errors: ["emails must be a JSON array"] };
  }
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parseJourney(parsed, count);
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, errors: ["emails must be a JSON array or a journey object"] };
  }
  if (count > MAX_IMPORTED_EMAILS) {
    return {
      ok: false,
      errors: [`a linear emails array allows at most ${MAX_IMPORTED_EMAILS} emails`],
    };
  }
  if (parsed.length !== count) {
    return {
      ok: false,
      errors: [`emails has ${parsed.length} item(s) but total_mails is ${count}`],
    };
  }

  const emails: ImportedEmail[] = [];
  const errors: string[] = [];
  parsed.forEach((item, index) => {
    const result = importedEmailSchema.safeParse(item);
    if (!result.success) {
      errors.push(
        `emails[${index}]: ${result.error.issues.map((issue) => issue.message).join(", ")}`,
      );
      return;
    }
    emails.push({
      sequence: result.data.sequence,
      emailType: result.data.type,
      subject: result.data.subject,
      body: result.data.body,
    });
  });
  if (errors.length > 0) return { ok: false, errors };

  const sequences = emails.map((email) => email.sequence).sort((a, b) => a - b);
  const expected = Array.from({ length: count }, (_, index) => index + 1);
  if (sequences.some((sequence, index) => sequence !== expected[index])) {
    return {
      ok: false,
      errors: [`email sequences must be 1 through ${count} with no duplicates`],
    };
  }

  return { ok: true, emails };
}
