import type { PrismaClient } from "@mail-orbyt/database";

type Prisma = Pick<PrismaClient, "conversation">;

export async function listConversations(prisma: Prisma, organisationId: string) {
  return prisma.conversation.findMany({
    where: { organisationId },
    include: {
      lead: true,
      messages: { orderBy: { occurredAt: "desc" }, take: 1 },
    },
    orderBy: { lastMessageAt: "desc" },
  });
}

export async function getConversation(
  prisma: Prisma,
  organisationId: string,
  conversationId: string,
) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { lead: true, messages: { orderBy: { occurredAt: "asc" } } },
  });
  if (!conversation || conversation.organisationId !== organisationId) return null;
  return conversation;
}
