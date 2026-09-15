import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { createPrismaClient } from "@interviewed/database";
import { UserRole } from "@interviewed/types";
import { logAuditEvent } from "../services/audit";
import { getUser, getPagination, paginate, getClientIp, getClientUserAgent } from "./utils";

const db = createPrismaClient();

const SAFE_USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  avatarUrl: true,
  phone: true,
  isActive: true,
  lastLoginAt: true,
  organizationId: true,
  createdAt: true,
  updatedAt: true,
} as const;

const updateUserSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().max(64).optional(),
  avatarUrl: z.string().url().optional(),
});

export async function registerUserRoutes(server: FastifyInstance): Promise<void> {
  server.get("/api/v1/users", { onRequest: [(server as any).requireRole(UserRole.SuperAdmin)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, unknown>;
    const { page, limit, skip, take } = getPagination(query);

    const where = { deletedAt: null } as { deletedAt: Date | null };
    const [users, total] = await Promise.all([
      db.user.findMany({ where, select: SAFE_USER_SELECT, skip, take, orderBy: { createdAt: "desc" } }),
      db.user.count({ where }),
    ]);

    return paginate(users, total, page, limit);
  });

  server.get("/api/v1/users/:id", { onRequest: [(server as any).requireRole(UserRole.SuperAdmin)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const user = await db.user.findFirst({
      where: { id, deletedAt: null },
      select: SAFE_USER_SELECT,
    });
    if (!user) {
      reply.code(404);
      return { error: "User not found" };
    }
    return user;
  });

  server.patch("/api/v1/users/:id", { onRequest: [(server as any).requireRole(UserRole.SuperAdmin)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const actor = getUser(request);

    const parsed = updateUserSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "Invalid input", details: parsed.error.flatten() };
    }

    const existing = await db.user.findFirst({ where: { id, deletedAt: null } });
    if (!existing) {
      reply.code(404);
      return { error: "User not found" };
    }

    const user = await db.user.update({
      where: { id },
      data: parsed.data as { firstName?: string; lastName?: string; phone?: string; avatarUrl?: string },
      select: SAFE_USER_SELECT,
    });

    await logAuditEvent({
      action: "user.update",
      entityType: "user",
      entityId: id,
      actorId: actor.id,
      actorEmail: actor.email,
      organizationId: existing.organizationId ?? undefined,
      metadata: { fields: Object.keys(parsed.data) },
      ipAddress: getClientIp(request),
      userAgent: getClientUserAgent(request),
    });

    return user;
  });

  server.delete("/api/v1/users/:id", { onRequest: [(server as any).requireRole(UserRole.SuperAdmin)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const actor = getUser(request);

    const existing = await db.user.findFirst({ where: { id, deletedAt: null } });
    if (!existing) {
      reply.code(404);
      return { error: "User not found" };
    }

    await db.user.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    await db.refreshToken.deleteMany({ where: { userId: id } });

    await logAuditEvent({
      action: "user.delete",
      entityType: "user",
      entityId: id,
      actorId: actor.id,
      actorEmail: actor.email,
      organizationId: existing.organizationId ?? undefined,
      ipAddress: getClientIp(request),
      userAgent: getClientUserAgent(request),
    });

    reply.code(204);
    return;
  });
}