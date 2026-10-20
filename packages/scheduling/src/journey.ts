import type { PrismaClient } from "@mail-orbyt/database";
import { graphNodeEdges, parseJourneyGraph, type JourneyGraph } from "@mail-orbyt/leads";
import type { JourneyDecider } from "./journey-decider";
import { nextSendableTime } from "./sending-window";

type Prisma = Pick<
  PrismaClient,
  | "campaignEnrollment"
  | "campaignStep"
  | "outboxItem"
  | "leadImportedEmail"
  | "enrollmentRoutingDecision"
>;

const DAY_MS = 24 * 60 * 60 * 1000;

/** A node may be sent at most this many times in one enrollment, so a cycle in the graph can never loop forever. */
export const JOURNEY_MAX_NODE_VISITS = 3;
/** How long to wait for a reply after a node that defines no `no_reply` edge before the journey ends. */
export const JOURNEY_DEFAULT_WAIT_DAYS = 7;

export type JourneyTrigger = "TIMEOUT" | "REPLY";

export interface JourneyEdge {
  to: string;
  afterDays?: number;
  when?: string;
}

function parseEdges(value: unknown): Record<string, JourneyEdge> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const edges: Record<string, JourneyEdge> = {};
  for (const [outcome, raw] of Object.entries(value as Record<string, unknown>)) {
    const edge = raw as { to?: unknown; afterDays?: unknown; when?: unknown } | null;
    if (edge && typeof edge.to === "string") {
      edges[outcome] = {
        to: edge.to,
        ...(typeof edge.afterDays === "number" ? { afterDays: edge.afterDays } : {}),
        ...(typeof edge.when === "string" ? { when: edge.when } : {}),
      };
    }
  }
  return edges;
}

function parseVisitCounts(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number",
    ),
  );
}

export interface ApplyOutcomeParams {
  trigger: JourneyTrigger;
  outcome: string;
  /** Who chose the outcome: deterministic rules now, the external decider later. */
  source: "RULE" | "DECIDER";
  reason?: string;
  /** True when the edge's own afterDays wait has already elapsed (the no-reply timer), so the next send is due immediately. */
  delayElapsed?: boolean;
  now?: Date;
}

export type ApplyOutcomeResult =
  { routed: true; toNodeKey: string | null; ended: boolean } | { routed: false };

interface JourneyNodeView {
  subject: string;
  body: string;
  edges: Record<string, JourneyEdge>;
}

interface NodeSource {
  leadId: string;
  campaign: { journeyGraph?: unknown };
}

function campaignGraph(source: NodeSource): JourneyGraph | null {
  if (!source.campaign.journeyGraph) return null;
  const parsed = parseJourneyGraph(source.campaign.journeyGraph);
  return parsed.ok ? parsed.graph : null;
}

/**
 * A journey node's content and outgoing edges. A campaign authored in the node
 * editor carries one shared graph; otherwise each lead brings its own, imported
 * from the CSV.
 */
async function loadJourneyNode(
  prisma: Prisma,
  source: NodeSource,
  nodeKey: string,
): Promise<JourneyNodeView | null> {
  const graph = campaignGraph(source);
  if (graph) {
    const node = graph.nodes.find((candidate) => candidate.key === nodeKey);
    if (!node) return null;
    let { subject, body } = node;
    if (node.importedSequence) {
      const imported = await prisma.leadImportedEmail.findUnique({
        where: { leadId_sequence: { leadId: source.leadId, sequence: node.importedSequence } },
      });
      subject = imported?.subject ?? "";
      body = imported?.body ?? "";
    }
    return { subject, body, edges: graphNodeEdges(graph, nodeKey) };
  }
  const node = await prisma.leadImportedEmail.findUnique({
    where: { leadId_nodeKey: { leadId: source.leadId, nodeKey } },
  });
  return node ? { subject: node.subject, body: node.body, edges: parseEdges(node.edges) } : null;
}

async function currentNodeEdges(prisma: Prisma, source: NodeSource, nodeKey: string) {
  return (await loadJourneyNode(prisma, source, nodeKey))?.edges ?? {};
}

/** The outcome label a journey graph uses for each rule-based reply classification. */
const REPLY_OUTCOMES: Record<string, string> = {
  INTERESTED: "interested",
  NOT_INTERESTED: "not_interested",
  OUT_OF_OFFICE: "out_of_office",
  UNCLASSIFIED: "replied",
};

/** Outcomes the timer fires, never offered to the model as a reply meaning. */
const TIMER_OUTCOMES = new Set(["no_reply", "opened_no_reply"]);

const DEFAULT_OUTCOME_DESCRIPTIONS: Record<string, string> = {
  interested: "The lead is interested, wants to talk, or asks for a call or more information.",
  not_interested: "The lead declines or says it is not a fit or not the right time.",
  out_of_office: "An automatic out-of-office or vacation reply.",
  replied: "Any other reply that none of the more specific outcomes describe.",
};

export interface RouteReplyParams {
  /** The rule-based ReplyClassification of the lead's reply. */
  classification: string;
  replySubject: string;
  replySnippet: string;
  decider?: JourneyDecider;
}

/**
 * Routes a lead's reply along the current node's edges. The model (if one is
 * configured) picks among the outcomes that node defines; if it is absent,
 * unsure or fails, the keyword classification decides. Returns `routed:false`
 * when no edge applies so the caller can hand the lead to a human.
 */
export async function routeJourneyReply(
  prisma: Prisma,
  enrollmentId: string,
  params: RouteReplyParams,
): Promise<ApplyOutcomeResult> {
  const enrollment = await prisma.campaignEnrollment.findUnique({
    where: { id: enrollmentId },
    include: { lead: true, campaign: true },
  });
  if (!enrollment?.currentNodeKey) return { routed: false };

  const node = await loadJourneyNode(prisma, enrollment, enrollment.currentNodeKey);
  const options = Object.fromEntries(
    Object.entries(node?.edges ?? {})
      .filter(([outcome]) => !TIMER_OUTCOMES.has(outcome))
      .map(([outcome, edge]) => [
        outcome,
        edge.when ??
          DEFAULT_OUTCOME_DESCRIPTIONS[outcome] ??
          `The reply means: ${outcome.replace(/_/g, " ")}.`,
      ]),
  );

  const decision = params.decider
    ? await params.decider.decide({
        options,
        state: {
          lead: { first_name: enrollment.lead.firstName, title: enrollment.lead.title },
          sent_email: { subject: node?.subject, body: node?.body },
          reply: { subject: params.replySubject, text: params.replySnippet },
        },
      })
    : null;

  if (decision) {
    return applyJourneyOutcome(prisma, enrollmentId, {
      trigger: "REPLY",
      outcome: decision.outcome,
      source: "DECIDER",
      reason: `confidence ${decision.confidence.toFixed(2)}`,
    });
  }
  return applyJourneyOutcome(prisma, enrollmentId, {
    trigger: "REPLY",
    outcome: REPLY_OUTCOMES[params.classification] ?? "replied",
    source: "RULE",
    reason: `Reply classified ${params.classification}`,
  });
}

/**
 * Moves a journey enrollment along the edge for `outcome` from the node it last
 * sent. Returns `routed: false` — touching nothing — when a REPLY has no edge to
 * follow, so the caller can fall back to exiting the lead to a human. A timeout
 * with no edge simply ends the journey. Every decision is logged.
 */
export async function applyJourneyOutcome(
  prisma: Prisma,
  enrollmentId: string,
  params: ApplyOutcomeParams,
): Promise<ApplyOutcomeResult> {
  const now = params.now ?? new Date();
  const enrollment = await prisma.campaignEnrollment.findUnique({
    where: { id: enrollmentId },
    include: { campaign: true },
  });
  if (
    !enrollment ||
    enrollment.status !== "ACTIVE" ||
    !enrollment.currentNodeKey ||
    enrollment.nextNodeKey
  ) {
    return { routed: false };
  }

  const edges = await currentNodeEdges(prisma, enrollment, enrollment.currentNodeKey);
  // A generic "replied" edge catches any reply the specific outcomes don't.
  const edge = edges[params.outcome] ?? (params.trigger === "REPLY" ? edges["replied"] : undefined);

  if (!edge && params.trigger === "REPLY") return { routed: false };

  const log = (toNodeKey: string | null) =>
    prisma.enrollmentRoutingDecision.create({
      data: {
        enrollmentId,
        fromNodeKey: enrollment.currentNodeKey,
        trigger: params.trigger,
        outcome: params.outcome,
        toNodeKey,
        source: params.source,
        reason: params.reason,
      },
    });

  const end = async (reason: string) => {
    await log(null);
    await prisma.campaignEnrollment.update({
      where: { id: enrollmentId },
      data: {
        status: "COMPLETED",
        exitedAt: now,
        exitReason: reason,
        nextNodeKey: null,
        nextDueAt: null,
        nextDecisionAt: null,
      },
    });
    return { routed: true, toNodeKey: null, ended: true } as const;
  };

  if (!edge || edge.to === "END") return end("Journey ended");

  const visits = parseVisitCounts(enrollment.visitCounts)[edge.to] ?? 0;
  if (visits >= JOURNEY_MAX_NODE_VISITS) {
    return end(`"${edge.to}" already sent ${JOURNEY_MAX_NODE_VISITS} times`);
  }

  const dueAt = params.delayElapsed
    ? now
    : new Date(now.getTime() + (edge.afterDays ?? 0) * DAY_MS);
  await log(edge.to);
  await prisma.campaignEnrollment.update({
    where: { id: enrollmentId },
    data: { nextNodeKey: edge.to, nextDueAt: dueAt, nextDecisionAt: null },
  });
  return { routed: true, toNodeKey: edge.to, ended: false };
}

/**
 * Bookkeeping after a journey node is sent: records the node as the current
 * one, counts the visit, and arms the no-reply timer from that node's
 * `no_reply` edge (or the default wait) so silence also routes.
 */
export async function journeyStateAfterSend(
  prisma: Pick<PrismaClient, "campaignEnrollment" | "leadImportedEmail">,
  enrollmentId: string,
  nodeKey: string,
  sentAt: Date,
) {
  const enrollment = await prisma.campaignEnrollment.findUnique({
    where: { id: enrollmentId },
    include: { campaign: true },
  });
  if (!enrollment) return {};
  const edges = await currentNodeEdges(prisma as Prisma, enrollment, nodeKey);
  const waitDays = edges["no_reply"]?.afterDays ?? JOURNEY_DEFAULT_WAIT_DAYS;
  const visits = parseVisitCounts(enrollment.visitCounts);
  return {
    currentNodeKey: nodeKey,
    nextNodeKey: null,
    nextDueAt: null,
    nextDecisionAt: new Date(sentAt.getTime() + waitDays * DAY_MS),
    sendCount: { increment: 1 },
    visitCounts: { ...visits, [nodeKey]: (visits[nodeKey] ?? 0) + 1 },
  };
}

/**
 * The journey counterpart of the linear scheduler: ensures the enrollment's
 * next node has an OutboxItem, or fires the no-reply timer when it has run out.
 * Idempotent, like the linear version — (campaign, lead, step, sendNo) is unique.
 */
export async function scheduleJourneyStep(prisma: Prisma, enrollmentId: string) {
  let enrollment = await prisma.campaignEnrollment.findUnique({
    where: { id: enrollmentId },
    include: { campaign: true },
  });
  if (!enrollment) return null;

  if (
    enrollment.currentNodeKey &&
    !enrollment.nextNodeKey &&
    enrollment.nextDecisionAt &&
    enrollment.nextDecisionAt.getTime() <= Date.now()
  ) {
    // Silence after an opened email can route differently from silence after
    // an unopened one — a rule on the tracking pixel, no model involved.
    const edges = await currentNodeEdges(prisma, enrollment, enrollment.currentNodeKey);
    const opened = edges["opened_no_reply"]
      ? await prisma.outboxItem.findFirst({
          where: { enrollmentId, nodeKey: enrollment.currentNodeKey, status: "SENT" },
          orderBy: { sentAt: "desc" },
          select: { openCount: true },
        })
      : null;
    await applyJourneyOutcome(prisma, enrollmentId, {
      trigger: "TIMEOUT",
      outcome: opened && opened.openCount > 0 ? "opened_no_reply" : "no_reply",
      source: "RULE",
      delayElapsed: true,
    });
    enrollment = await prisma.campaignEnrollment.findUnique({
      where: { id: enrollmentId },
      include: { campaign: true },
    });
    if (!enrollment) return null;
  }
  if (enrollment.status !== "PENDING" && enrollment.status !== "ACTIVE") return null;

  let nodeKey: string | null = enrollment.nextNodeKey;
  let dueAt: Date = enrollment.nextDueAt ?? new Date();
  if (!nodeKey) {
    if (enrollment.sendCount > 0 || enrollment.currentNodeKey) return null;
    const graph = campaignGraph(enrollment);
    const startKey = graph
      ? graph.start
      : (
          await prisma.leadImportedEmail.findFirst({
            where: { leadId: enrollment.leadId, isStart: true },
          })
        )?.nodeKey;
    if (!startKey) {
      await prisma.campaignEnrollment.update({
        where: { id: enrollmentId },
        data: { status: "EXITED", exitedAt: new Date(), exitReason: "No start email imported" },
      });
      return null;
    }
    nodeKey = startKey;
    dueAt = enrollment.enrolledAt;
  }

  const step = await prisma.campaignStep.findFirst({
    where: { campaignId: enrollment.campaignId },
    orderBy: { orderIndex: "asc" },
  });
  if (!step) return null;

  const existing = await prisma.outboxItem.findUnique({
    where: {
      campaignId_leadId_campaignStepId_sendNo: {
        campaignId: enrollment.campaignId,
        leadId: enrollment.leadId,
        campaignStepId: step.id,
        sendNo: enrollment.sendCount,
      },
    },
  });
  if (existing) return existing;

  const now = new Date();
  return prisma.outboxItem.create({
    data: {
      organisationId: enrollment.campaign.organisationId,
      campaignId: enrollment.campaignId,
      leadId: enrollment.leadId,
      campaignStepId: step.id,
      enrollmentId: enrollment.id,
      nodeKey,
      sendNo: enrollment.sendCount,
      scheduledFor: nextSendableTime(
        enrollment.campaign,
        dueAt.getTime() > now.getTime() ? dueAt : now,
      ),
    },
  });
}
