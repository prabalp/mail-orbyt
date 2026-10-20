import { z } from "zod";
import { JOURNEY_END, MAX_EDGE_DELAY_DAYS, MAX_JOURNEY_NODES } from "./imported-emails";

/**
 * The campaign-level journey graph authored in the node editor. Nodes are email
 * templates; edges say which node follows which outcome; variables say how each
 * {{token}} in a template is filled in for a lead.
 */

/** Lead fields a template variable can read. `company` is the lead's company name. */
export const JOURNEY_LEAD_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "title",
  "company",
  "industry",
  "city",
  "state",
  "country",
  "websiteUrl",
  "linkedinUrl",
] as const;
export type JourneyLeadField = (typeof JOURNEY_LEAD_FIELDS)[number];

const NODE_KEY = /^[A-Za-z0-9_-]{1,40}$/;
const OUTCOME_KEY = /^[a-z0-9_]{1,40}$/;
const TOKEN = /\{\{\s*([A-Za-z0-9_]{1,40})\s*\}\}/g;

const variableSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("lead"),
    field: z.enum(JOURNEY_LEAD_FIELDS),
    /** Used when the lead has no value for the field. */
    fallback: z.string().max(200).optional(),
  }),
  z.object({ source: z.literal("fixed"), value: z.string().max(500) }),
]);
export type JourneyVariable = z.infer<typeof variableSchema>;

export const journeyGraphSchema = z.object({
  start: z.string(),
  nodes: z
    .array(
      z.object({
        key: z.string(),
        label: z.string().trim().max(80).default(""),
        subject: z.string().trim().max(150),
        body: z.string().trim().max(4000),
        x: z.number().default(0),
        y: z.number().default(0),
      }),
    )
    .max(MAX_JOURNEY_NODES),
  edges: z.array(
    z.object({
      from: z.string(),
      outcome: z.string(),
      to: z.string(),
      afterDays: z.number().int().min(0).max(MAX_EDGE_DELAY_DAYS).optional(),
      when: z.string().trim().max(300).optional(),
    }),
  ),
  variables: z.record(z.string(), variableSchema).default({}),
});
export type JourneyGraph = z.infer<typeof journeyGraphSchema>;

/** The `{{tokens}}` a template uses, in first-seen order. */
export function templateTokens(template: string): string[] {
  const seen = new Set<string>();
  for (const match of template.matchAll(TOKEN)) seen.add(match[1] as string);
  return [...seen];
}

function isBuiltinToken(token: string): JourneyLeadField | undefined {
  return JOURNEY_LEAD_FIELDS.find((field) => field.toLowerCase() === token.toLowerCase());
}

export type ParsedJourneyGraph =
  { ok: true; graph: JourneyGraph } | { ok: false; errors: string[] };

/** Parses and fully validates an untrusted graph (shape, references, reachability, variables). */
export function parseJourneyGraph(input: unknown): ParsedJourneyGraph {
  const parsed = journeyGraphSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    };
  }
  const graph = parsed.data;
  const errors: string[] = [];
  const keys = new Set<string>();

  for (const node of graph.nodes) {
    if (!NODE_KEY.test(node.key)) errors.push(`node "${node.key}": invalid id`);
    if (node.key === JOURNEY_END) errors.push(`node id "${JOURNEY_END}" is reserved`);
    if (keys.has(node.key)) errors.push(`duplicate node id "${node.key}"`);
    keys.add(node.key);
    if (!node.subject) errors.push(`${node.label || node.key}: subject is empty`);
    if (!node.body) errors.push(`${node.label || node.key}: body is empty`);
  }
  if (graph.nodes.length === 0) errors.push("add at least one email");
  if (graph.nodes.length > 0 && !keys.has(graph.start)) {
    errors.push("choose which email the journey starts with");
  }

  const seenEdges = new Set<string>();
  for (const edge of graph.edges) {
    if (!keys.has(edge.from)) errors.push(`an edge starts at unknown email "${edge.from}"`);
    if (edge.to !== JOURNEY_END && !keys.has(edge.to)) {
      errors.push(`an edge points to unknown email "${edge.to}"`);
    }
    if (!OUTCOME_KEY.test(edge.outcome)) {
      errors.push(`outcome "${edge.outcome}" must be lowercase letters, digits or _`);
    }
    const id = `${edge.from}:${edge.outcome}`;
    if (seenEdges.has(id)) errors.push(`"${edge.from}" has two "${edge.outcome}" connections`);
    seenEdges.add(id);
  }

  for (const token of Object.keys(graph.variables)) {
    if (!/^[A-Za-z0-9_]{1,40}$/.test(token)) errors.push(`variable "${token}" has an invalid name`);
  }
  for (const node of graph.nodes) {
    for (const token of [...templateTokens(node.subject), ...templateTokens(node.body)]) {
      if (!graph.variables[token] && !isBuiltinToken(token)) {
        errors.push(
          `${node.label || node.key}: {{${token}}} has no value — map it under Variables`,
        );
      }
    }
  }

  if (errors.length === 0) {
    const reached = new Set<string>();
    const queue = [graph.start];
    while (queue.length > 0) {
      const key = queue.shift() as string;
      if (reached.has(key)) continue;
      reached.add(key);
      for (const edge of graph.edges) {
        if (edge.from === key && edge.to !== JOURNEY_END) queue.push(edge.to);
      }
    }
    for (const node of graph.nodes) {
      if (!reached.has(node.key)) {
        errors.push(`${node.label || node.key} can't be reached from the start`);
      }
    }
  }

  return errors.length > 0 ? { ok: false, errors: [...new Set(errors)] } : { ok: true, graph };
}

/** The lead values a template can read, with `company` already resolved to a name. */
export type JourneyLeadValues = Partial<Record<JourneyLeadField, string | null>>;

/** Fills {{tokens}} for one lead. Unmapped built-ins read the lead field directly; a missing value falls back (firstName falls back to "there"), never leaving a raw token. */
export function renderJourneyTemplate(
  template: string,
  variables: JourneyGraph["variables"],
  lead: JourneyLeadValues,
): string {
  return template.replace(TOKEN, (_match, token: string) => {
    const mapped = variables[token];
    if (mapped?.source === "fixed") return mapped.value;
    const field = mapped?.source === "lead" ? mapped.field : isBuiltinToken(token);
    const value = field ? lead[field]?.toString().trim() : undefined;
    if (value) return value;
    if (mapped?.source === "lead" && mapped.fallback !== undefined) return mapped.fallback;
    return field === "firstName" ? "there" : "";
  });
}

/** One node's outgoing edges in the shape the routing engine reads: outcome -> { to, afterDays?, when? }. */
export function graphNodeEdges(
  graph: JourneyGraph,
  nodeKey: string,
): Record<string, { to: string; afterDays?: number; when?: string }> {
  const edges: Record<string, { to: string; afterDays?: number; when?: string }> = {};
  for (const edge of graph.edges) {
    if (edge.from !== nodeKey) continue;
    edges[edge.outcome] = {
      to: edge.to,
      ...(edge.afterDays !== undefined ? { afterDays: edge.afterDays } : {}),
      ...(edge.when ? { when: edge.when } : {}),
    };
  }
  return edges;
}
