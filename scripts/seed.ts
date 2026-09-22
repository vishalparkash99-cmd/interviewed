import { PrismaClient } from "@interviewed/database";
import { config } from "@interviewed/config";
import { createLogger } from "@interviewed/config/logger";
import { v4 as uuid } from "uuid";
import bcrypt from "bcrypt";

const db = new PrismaClient();
const logger = createLogger("seed");

async function main() {
  logger.info("Starting seed...");

  const settings: Array<{ key: string; value: string }> = [
    { key: "upgradeUrl", value: process.env.UPGRADE_URL || "" },
    { key: "defaultTrialLimit", value: process.env.DEFAULT_TRIAL_LIMIT || "5" },
  ];
  for (const item of settings) {
    const existing = await db.platformSetting.findUnique({ where: { key: item.key } });
    if (!existing) {
      await db.platformSetting.create({ data: item });
      logger.info({ key: item.key }, "Platform setting created");
    }
  }

  const superAdminExists = await db.user.findUnique({ where: { email: "admin@interviewed.app" } });
  if (!superAdminExists) {
    const superAdminPassword = await bcrypt.hash("super123", 12);
    await db.user.create({ data: { id: uuid(), email: "admin@interviewed.app", passwordHash: superAdminPassword, firstName: "Platform", lastName: "Admin", role: "super_admin" } });
    logger.info("Super admin created");
  } else {
    logger.info("Super admin already exists");
  }

  const orgExists = await db.organization.findUnique({ where: { slug: "acme-corp" } });
  if (orgExists) {
    await db.organization.update({ where: { id: orgExists.id }, data: { plan: "unlimited" } });
    logger.info("Organization already exists, plan set to unlimited");
    return;
  }

  const org = await db.organization.create({
    data: { id: uuid(), name: "Acme Corporation", slug: "acme-corp", industry: "Technology", timezone: "America/New_York", plan: "unlimited" },
  });
  logger.info({ orgId: org.id }, "Organization created");

  const adminPassword = await bcrypt.hash("admin123", 12);
  const recruiterPassword = await bcrypt.hash("recruiter123", 12);
  const candidatePassword = await bcrypt.hash("candidate123", 12);

  const admin = await db.user.create({ data: { id: uuid(), email: "admin@acme.com", passwordHash: adminPassword, firstName: "Admin", lastName: "User", role: "org_admin", organizationId: org.id } });
  const recruiter = await db.user.create({ data: { id: uuid(), email: "recruiter@acme.com", passwordHash: recruiterPassword, firstName: "Sarah", lastName: "Connor", role: "recruiter", organizationId: org.id } });
  const candidate = await db.user.create({ data: { id: uuid(), email: "candidate@email.com", passwordHash: candidatePassword, firstName: "Alex", lastName: "Johnson", role: "candidate", organizationId: org.id } });

  logger.info({ adminId: admin.id, recruiterId: recruiter.id, candidateId: candidate.id }, "Users created");

  const job = await db.job.create({
    data: {
      id: uuid(), title: "Senior Backend Engineer", slug: "senior-backend-engineer",
      department: "Engineering", location: "Remote", employmentType: "fulltime",
      experienceMinYears: 5, experienceMaxYears: 15,
      description: "Design and build scalable APIs and microservices for our platform.",
      rolesResponsibilities: [
        { title: "API Development", description: "Design RESTful APIs and microservices" },
        { title: "Database Engineering", description: "Optimize PostgreSQL schemas and queries" },
        { title: "System Design", description: "Lead architectural decisions" },
      ],
      requiredSkills: ["Node.js", "TypeScript", "PostgreSQL", "Redis", "Docker", "AWS"],
      preferredSkills: ["GraphQL", "Kubernetes", "Kafka"],
      requiredQualifications: ["BS in Computer Science", "5+ years backend experience"],
      preferredQualifications: ["MS in Computer Science", "Microservices experience"],
      domain: "Technology",
      interviewDuration: 45, interviewDifficulty: "medium",
      shortlistCount: 10, minimumScreeningScore: 60,
      scoringWeights: { technical: 30, experience: 25, responsibilities: 25, qualification: 10, domain: 10 },
      organizationId: org.id, ownerId: recruiter.id, status: "active",
    },
  });
  logger.info({ jobId: job.id }, "Job created");

  const cand = await db.candidate.create({
    data: {
      id: uuid(), externalId: "EXT-001", name: "Alex Johnson", email: "alex@email.com",
      phone: "+1-555-0101", location: "San Francisco, CA", yearsOfExperience: 7,
      currentJobTitle: "Backend Developer", currentCompany: "TechFlow",
      normalizedData: { skills: ["Node.js", "TypeScript", "PostgreSQL", "Redis", "Docker", "AWS"], experience: [{ title: "Backend Developer", company: "TechFlow", summary: "Built scalable APIs" }], education: [{ degree: "BS", institution: "UC Berkeley", field: "CS" }] },
      organizationId: org.id, status: "active",
    },
  });
  logger.info({ candidateId: cand.id }, "Candidate created");

  logger.info("Seed complete");
}

main().catch((err) => { logger.error({ err }, "Seed failed"); process.exit(1); }).finally(() => db.$disconnect());
