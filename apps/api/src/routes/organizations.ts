import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { createPrismaClient } from "@interviewed/database";
import { UserRole } from "@interviewed/types";
import { logAuditEvent } from "../services/audit";
import { getUser, getPagination, paginate, slugify, getClientIp, getClientUserAgent } from "./utils";

const db = createPrismaClient();

const createOrganizationSchema = z.object({
  name: z.string().min(1).max(200),
  logoUrl: z.string().url().optional(),
  industry: z.string().max(200).optional(),
  timezone: z.string().max(64).default("UTC"),
  settings: z.record(z.unknown()).optional(),
});

const updateOrganizationSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  industry: z.string().max(200).nullable().optional(),
  timezone: z.string().max(64).optional(),
  settings: z.record(z.unknown()).optional(),
});

async function uniqueOrgSlug(base: string): Promise<string> {
  let slug = slugify(base);
  let n = 1;
  while (await db.organization.findUnique({ where: { slug } })) {
    slug = `${slugify(base)}-${n++}`;
  }
  return slug;
}

export async function registerOrganizationRoutes(server: FastifyInstance): Promise<void> {
  server.get("/api/v1/organizations", { onRequest: [(server as any).requireRole(UserRole.SuperAdmin)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, unknown>;
    const { page, limit, skip, take } = getPagination(query);

    const where = { deletedAt: null } as { deletedAt: Date | null };
    const [organizations, total] = await Promise.all([
      db.organization.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      db.organization.count({ where }),
    ]);

    return paginate(organizations, total, page, limit);
  });

  server.post("/api/v1/organizations", { onRequest: [(server as any).requireRole(UserRole.SuperAdmin)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const actor = getUser(request);

    const parsed = createOrganizationSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "Invalid input", details: parsed.error.flatten() };
    }

    const { name, logoUrl, industry, timezone, settings } = parsed.data;
    const slug = await uniqueOrgSlug(name);

    const organization = await db.organization.create({
      data: {
        name,
        slug,
        logoUrl: logoUrl ?? null,
        industry: industry ?? null,
        timezone,
        settings: (settings ?? {}) as object,
      },
    });

    await logAuditEvent({
      action: "organization.create",
      entityType: "organization",
      entityId: organization.id,
      actorId: actor.id,
      actorEmail: actor.email,
      organizationId: organization.id,
      metadata: { name, slug },
      ipAddress: getClientIp(request),
      userAgent: getClientUserAgent(request),
    });

    reply.code(201);
    return organization;
  });

  server.get("/api/v1/organizations/:id", { onRequest: [(server as any).requireRole(UserRole.SuperAdmin)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const organization = await db.organization.findFirst({ where: { id, deletedAt: null } });
    if (!organization) {
      reply.code(404);
      return { error: "Organization not found" };
    }
    return organization;
  });

  server.patch("/api/v1/organizations/:id", { onRequest: [(server as any).requireRole(UserRole.SuperAdmin)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const actor = getUser(request);

    const parsed = updateOrganizationSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "Invalid input", details: parsed.error.flatten() };
    }

    const existing = await db.organization.findFirst({ where: { id, deletedAt: null } });
    if (!existing) {
      reply.code(404);
      return { error: "Organization not found" };
    }

    const { settings, ...rest } = parsed.data;
    const data = {
      ...(rest.name !== undefined ? { name: rest.name } : {}),
      ...(rest.industry !== undefined ? { industry: rest.industry } : {}),
      ...(rest.timezone !== undefined ? { timezone: rest.timezone } : {}),
      ...(settings !== undefined ? { settings: settings as object } : {}),
    };

    const organization = await db.organization.update({ where: { id }, data });

    await logAuditEvent({
      action: "organization.update",
      entityType: "organization",
      entityId: id,
      actorId: actor.id,
      actorEmail: actor.email,
      organizationId: id,
      metadata: { fields: Object.keys(data) },
      ipAddress: getClientIp(request),
      userAgent: getClientUserAgent(request),
    });

    return organization;
  });

  server.delete("/api/v1/organizations/:id", { onRequest: [(server as any).requireRole(UserRole.SuperAdmin)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const actor = getUser(request);

    const existing = await db.organization.findFirst({ where: { id, deletedAt: null } });
    if (!existing) {
      reply.code(404);
      return { error: "Organization not found" };
    }

    await db.organization.update({ where: { id }, data: { deletedAt: new Date() } });
    await db.user.updateMany({ where: { organizationId: id, deletedAt: null }, data: { isActive: false } });

    await logAuditEvent({
      action: "organization.delete",
      entityType: "organization",
      entityId: id,
      actorId: actor.id,
      actorEmail: actor.email,
      organizationId: id,
      ipAddress: getClientIp(request),
      userAgent: getClientUserAgent(request),
    });

    reply.code(204);
    return;
  });
}