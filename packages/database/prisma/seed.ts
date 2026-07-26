import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Duplicated from packages/authentication's hashPassword (same cost factor)
// rather than imported, to avoid a database -> authentication workspace
// dependency (database is the lower-level package; authentication already
// depends on it, not the other way around).
const BCRYPT_COST_FACTOR = 12;
const SEED_PASSWORD = "Sup3rSecretPass1"; // local dev only — never used outside seed data

async function seedDemoOrganisation(): Promise<void> {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, BCRYPT_COST_FACTOR);
  const now = new Date();

  const roles = [
    { email: "owner@demo.mailorbyt.test", name: "Demo Owner", role: "OWNER" as const },
    { email: "admin@demo.mailorbyt.test", name: "Demo Admin", role: "ADMIN" as const },
    { email: "member@demo.mailorbyt.test", name: "Demo Member", role: "MEMBER" as const },
    { email: "viewer@demo.mailorbyt.test", name: "Demo Viewer", role: "VIEWER" as const },
  ];

  const organisation = await prisma.organisation.upsert({
    where: { slug: "demo-organisation" },
    create: { name: "Demo Organisation", slug: "demo-organisation" },
    update: {},
  });

  for (const { email, name, role } of roles) {
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, name, passwordHash, emailVerified: now },
      update: {},
    });

    await prisma.organisationMembership.upsert({
      where: { organisationId_userId: { organisationId: organisation.id, userId: user.id } },
      create: { organisationId: organisation.id, userId: user.id, role },
      update: { role },
    });
  }
}

/**
 * Seeds a demo organisation with one verified user per role
 * (owner/admin/member/viewer@demo.mailorbyt.test, password "Sup3rSecretPass1")
 * plus the operational feature flags. Leads, companies, research, campaigns,
 * inboxes, and conversation/meeting fixtures are added as those models land
 * in later phases (see docs/local-development.md).
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

  await seedDemoOrganisation();
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
