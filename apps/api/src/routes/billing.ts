import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { UserRole } from "@interviewed/types";
import { getUser } from "./utils";
import { getOrgUsage } from "../services/platform-settings";

export async function registerBillingRoutes(server: FastifyInstance): Promise<void> {
  server.get("/api/v1/org/billing", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(request);
    if (!user.organizationId) {
      reply.code(403);
      return { error: "Organization required" };
    }
    const usage = await getOrgUsage(user.organizationId);
    if (!usage) {
      reply.code(404);
      return { error: "Organization not found" };
    }
    return { data: usage };
  });
}