import type { PrismaClient } from "@mail-orbyt/database";
import { importedSequencesIn, parseJourneyGraph, type JourneyGraph } from "@mail-orbyt/leads";

type Prisma = Pick<PrismaClient, "campaign" | "campaignEnrollment">;

export class InvalidJourneyGraphError extends Error {
  constructor(readonly errors: string[]) {
    super(errors[0] ?? "Invalid journey");
    this.name = "InvalidJourneyGraphError";
  }
}

/** The campaign's saved graph, or null if it has none (or isn't a journey / isn't in this organisation). */
export async function getJourneyGraph(
  prisma: Pick<PrismaClient, "campaign">,
  organisationId: string,
  campaignId: string,
): Promise<{ found: boolean; graph: JourneyGraph | null }> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.organisationId !== organisationId) {
    return { found: false, graph: null };
  }
  const parsed = campaign.journeyGraph ? parseJourneyGraph(campaign.journeyGraph) : null;
  return { found: true, graph: parsed?.ok ? parsed.graph : null };
}

/**
 * Validates and saves the node-editor graph. Saving is allowed while the
 * campaign is running, but never removes an email that an enrolled lead is
 * sitting on or about to receive — that would strand them mid-journey.
 */
export async function saveJourneyGraph(
  prisma: Prisma,
  organisationId: string,
  campaignId: string,
  input: unknown,
): Promise<JourneyGraph | null> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.organisationId !== organisationId) return null;
  if (campaign.routingMode !== "JOURNEY") {
    throw new InvalidJourneyGraphError(["Only a journey campaign has a journey graph."]);
  }

  const parsed = parseJourneyGraph(input);
  if (!parsed.ok) throw new InvalidJourneyGraphError(parsed.errors);

  const keys = new Set(parsed.graph.nodes.map((node) => node.key));
  const live = await prisma.campaignEnrollment.findMany({
    where: { campaignId, status: { in: ["PENDING", "ACTIVE", "PAUSED"] } },
    select: { currentNodeKey: true, nextNodeKey: true },
  });
  const stranded = new Set<string>();
  for (const enrollment of live) {
    for (const key of [enrollment.currentNodeKey, enrollment.nextNodeKey]) {
      if (key && !keys.has(key)) stranded.add(key);
    }
  }
  if (stranded.size > 0) {
    throw new InvalidJourneyGraphError([
      `Leads are currently on ${[...stranded].join(", ")} — keep ${stranded.size === 1 ? "that email" : "those emails"} or wait until they have moved on.`,
    ]);
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { journeyGraph: JSON.parse(JSON.stringify(parsed.graph)) as object },
  });
  return parsed.graph;
}

/**
 * The uploaded-email sequence numbers every enrolled lead must have for this
 * campaign to send: the graph's "use uploaded email #N" nodes for a journey
 * built in the editor, otherwise the sequences of the steps set to imported
 * content (a step's sequence is its orderIndex + 1).
 */
export async function requiredImportedSequences(
  prisma: Pick<PrismaClient, "campaignStep">,
  campaign: { id: string; routingMode: string; journeyGraph?: unknown },
): Promise<number[]> {
  if (campaign.routingMode === "JOURNEY" && campaign.journeyGraph) {
    const parsed = parseJourneyGraph(campaign.journeyGraph);
    if (parsed.ok) return importedSequencesIn(parsed.graph);
  }
  const steps = await prisma.campaignStep.findMany({
    where: { campaignId: campaign.id, useImportedContent: true },
    select: { orderIndex: true },
  });
  return steps.map((step) => step.orderIndex + 1);
}
