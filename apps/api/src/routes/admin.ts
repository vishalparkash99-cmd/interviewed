import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { createPrismaClient } from "@interviewed/database";
import { UserRole, InterviewStatus } from "@interviewed/types";
import { getUser, isSuperAdmin, getClientIp, getClientUserAgent } from "./utils";
import { logAuditEvent } from "../services/audit";
import {
  getAllPlatformSettings,
  setPlatformSetting,
  getOrgUsage,
} from "../services/platform-settings";

const db = createPrismaClient();

const settingsPatchSchema = z.object({
  upgradeUrl: z.string().url().max(500).optional(),
  defaultTrialLimit: z.number().int().min(0).max(1000).optional(),
});

const orgPatchSchema = z.object({
  plan: z.enum(["trial", "unlimited"]).optional(),
  trialInterviewLimit: z.number().int().min(0).max(1000).optional(),
});

function adminOnly(user: { role: string }): boolean {
  return isSuperAdmin(user);
}

export async function registerAdminRoutes(server: FastifyInstance): Promise<void> {
  // Platform settings (editable configurable items for the product)
  server.get("/api/v1/admin/settings", { onRequest: [(server as any).requireRole(UserRole.SuperAdmin)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(request);
    if (!adminOnly(user)) {
      reply.code(403);
      return { error: "Forbidden" };
    }
    return { data: await getAllPlatformSettings() };
  });

  server.patch("/api/v1/admin/settings", { onRequest: [(server as any).requireRole(UserRole.SuperAdmin)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(request);
    if (!adminOnly(user)) {
      reply.code(403);
      return { error: "Forbidden" };
    }
    const parsed = settingsPatchSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "Invalid input", details: parsed.error.flatten() };
    }
    const changes: Record<string, unknown>[] = [];
    if (parsed.data.upgradeUrl !== undefined) {
      await setPlatformSetting("upgradeUrl", parsed.data.upgradeUrl);
      changes.push({ key: "upgradeUrl" });
    }
    if (parsed.data.defaultTrialLimit !== undefined) {
      await setPlatformSetting("defaultTrialLimit", String(parsed.data.defaultTrialLimit));
      changes.push({ key: "defaultTrialLimit" });
    }

    await logAuditEvent({
      action: "admin.settings.update",
      entityType: "platform_setting",
      entityId: "global",
      actorId: user.id,
      actorEmail: user.email,
      metadata: { changes },
      ipAddress: getClientIp(request),
      userAgent: getClientUserAgent(request),
    });

    return { ok: true, data: await getAllPlatformSettings() };
  });

  // Organization list with usage for super admin
  server.get("/api/v1/admin/orgs", { onRequest: [(server as any).requireRole(UserRole.SuperAdmin)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(request);
    if (!adminOnly(user)) {
      reply.code(403);
      return { error: "Forbidden" };
    }

    const orgs = await db.organization.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: { users: { select: { id: true, email: true, role: true } } },
    });

    const rows = await Promise.all(
      orgs.map(async (org) => {
        const usage = await getOrgUsage(org.id);
        const interviewCount = await db.interview.count({ where: { organizationId: org.id } });
        const completedCount = await db.interview.count({ where: { organizationId: org.id, status: InterviewStatus.Completed } });
        return {
          id: org.id,
          name: org.name,
          slug: org.slug,
          plan: org.plan,
          trialInterviewLimit: org.trialInterviewLimit,
          createdAt: org.createdAt,
          members: org.users.filter((u) => u.role !== UserRole.Candidate).length,
          interviews: interviewCount,
          completedInterviews: completedCount,
          used: usage?.used ?? 0,
          blocked: usage?.blocked ?? false,
        };
      })
    );

    return { data: rows };
  });

  // Update an organization plan / trial limit
  server.patch("/api/v1/admin/orgs/:id", { onRequest: [(server as any).requireRole(UserRole.SuperAdmin)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(request);
    if (!adminOnly(user)) {
      reply.code(403);
      return { error: "Forbidden" };
    }
    const { id } = request.params as { id: string };
    const parsed = orgPatchSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "Invalid input", details: parsed.error.flatten() };
    }

    const org = await db.organization.findUnique({ where: { id } });
    if (!org || org.deletedAt) {
      reply.code(404);
      return { error: "Organization not found" };
    }

    const updated = await db.organization.update({
      where: { id },
      data: { ...parsed.data },
    });

    await logAuditEvent({
      action: "admin.org.update",
      entityType: "organization",
      entityId: org.id,
      actorId: user.id,
      actorEmail: user.email,
      organizationId: org.id,
      metadata: parsed.data,
      ipAddress: getClientIp(request),
      userAgent: getClientUserAgent(request),
    });

    return { ok: true, data: { id: updated.id, plan: updated.plan, trialInterviewLimit: updated.trialInterviewLimit } };
  });
}