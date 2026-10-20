import type { PrismaClient } from "@mail-orbyt/database";
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
}

function parseEdges(value: unknown): Record<string, JourneyEdge> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const edges: Record<string, JourneyEdge> = {};
  for (const [outcome, raw] of Object.entries(value as Record<string, unknown>)) {
    const edge = raw as { to?: unknown; afterDays?: unknown } | null;
    if (edge && typeof edge.to === "string") {
      edges[outcome] =
        typeof edge.afterDays === "number"
          ? { to: edge.to, afterDays: edge.afterDays }
          : { to: edge.to };
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
  const enrollment = await prisma.campaignEnrollment.findUnique({ where: { id: enrollmentId } });
  if (
    !enrollment ||
    enrollment.status !== "ACTIVE" ||
    !enrollment.currentNodeKey ||
    enrollment.nextNodeKey
  ) {
    return { routed: false };
  }

  const node = await prisma.leadImportedEmail.findUnique({
    where: { leadId_nodeKey: { leadId: enrollment.leadId, nodeKey: enrollment.currentNodeKey } },
  });
  const edges = parseEdges(node?.edges);
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
  const enrollment = await prisma.campaignEnrollment.findUnique({ where: { id: enrollmentId } });
  if (!enrollment) return {};
  const node = await prisma.leadImportedEmail.findUnique({
    where: { leadId_nodeKey: { leadId: enrollment.leadId, nodeKey } },
  });
  const waitDays = parseEdges(node?.edges)["no_reply"]?.afterDays ?? JOURNEY_DEFAULT_WAIT_DAYS;
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
    await applyJourneyOutcome(prisma, enrollmentId, {
      trigger: "TIMEOUT",
      outcome: "no_reply",
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
    const start = await prisma.leadImportedEmail.findFirst({
      where: { leadId: enrollment.leadId, isStart: true },
    });
    if (!start?.nodeKey) {
      await prisma.campaignEnrollment.update({
        where: { id: enrollmentId },
        data: { status: "EXITED", exitedAt: new Date(), exitReason: "No start email imported" },
      });
      return null;
    }
    nodeKey = start.nodeKey;
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
