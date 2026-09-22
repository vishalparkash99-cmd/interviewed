import type { FastifyInstance } from "fastify";
import { registerAuthRoutes } from "./auth";
import { registerUserRoutes } from "./users";
import { registerOrganizationRoutes } from "./organizations";
import { registerJobRoutes } from "./jobs";
import { registerCandidateRoutes } from "./candidates";
import { registerInterviewRoutes } from "./interviews";
import { registerEmailRoutes } from "./emails";
import { registerDashboardRoutes } from "./dashboard";
import { registerResumeRoutes } from "./resumes";
import { registerMatchRoutes } from "./matches";
import { registerReportRoutes } from "./reports";
import { registerAdminRoutes } from "./admin";
import { registerBillingRoutes } from "./billing";

export async function registerAllRoutes(server: FastifyInstance): Promise<void> {
  await registerAuthRoutes(server);
  await registerUserRoutes(server);
  await registerOrganizationRoutes(server);
  await registerJobRoutes(server);
  await registerCandidateRoutes(server);
  await registerInterviewRoutes(server);
  await registerEmailRoutes(server);
  await registerDashboardRoutes(server);
  await registerResumeRoutes(server);
  await registerMatchRoutes(server);
  await registerReportRoutes(server);
  await registerAdminRoutes(server);
  await registerBillingRoutes(server);
}