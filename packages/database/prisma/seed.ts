import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Phase 0 seed: operational feature flags only. Organisation/user/lead/etc.
 * seed data is added as those models land (see docs/local-development.md).
 */
async function main(): Promise<void> {
  await prisma.featureFlag.upsert({
    where: { key: "emergency_stop" },
    create: {
      key: "emergency_stop",
      enabled: false,
      description: "Organisation-wide kill switch for all outbound sending.",
    },
    update: {},
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
