import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createPrismaClient } from "@interviewed/database";
import { UserRole, CandidateStatus } from "@interviewed/types";
import { createCandidateSchema, updateCandidateSchema } from "../validation";
import { logAuditEvent } from "../services/audit";
import { getUser, isSuperAdmin, getPagination, paginate, getClientIp, getClientUserAgent } from "./utils";

const db = createPrismaClient();

function orgClause(user: { role: string; organizationId?: string | null }): { organizationId: string } | Record<string, never> {
  if (isSuperAdmin(user)) return {};
  return { organizationId: user.organizationId ?? "" };
}

function isCandidateStatus(value: unknown): value is CandidateStatus {
  return Object.values(CandidateStatus).includes(value as CandidateStatus);
}

export async function registerCandidateRoutes(server: FastifyInstance): Promise<void> {
  server.get("/api/v1/candidates", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(request);
    if (!isSuperAdmin(user) && !user.organizationId) {
      reply.code(403);
      return { error: "Organization required" };
    }

    const query = request.query as Record<string, unknown>;
    const { page, limit, skip, take } = getPagination(query);

    const status = typeof query.status === "string" && isCandidateStatus(query.status) ? query.status : undefined;
    const where = {
      deletedAt: null,
      ...orgClause(user),
      ...(status ? { status } : {}),
    };

    const [candidates, total] = await Promise.all([
      db.candidate.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: { resume: { select: { id: true, fileName: true, fileMimeType: true, fileSize: true, status: true } } },
      }),
      db.candidate.count({ where }),
    ]);

    return paginate(candidates, total, page, limit);
  });

  server.get("/api/v1/candidates/:id", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const user = getUser(request);
    if (!isSuperAdmin(user) && !user.organizationId) {
      reply.code(403);
      return { error: "Organization required" };
    }

    const candidate = await db.candidate.findFirst({
      where: { id, deletedAt: null, ...orgClause(user) },
      include: {
        resume: true,
        matches: { include: { job: { select: { id: true, title: true, slug: true, status: true } } } },
        interviews: { select: { id: true, status: true, jobId: true, createdAt: true, startedAt: true, endedAt: true } },
      },
    });
    if (!candidate) {
      reply.code(404);
      return { error: "Candidate not found" };
    }
    return candidate;
  });

  server.post("/api/v1/candidates", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(request);

    const parsed = createCandidateSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "Invalid input", details: parsed.error.flatten() };
    }
    const data = parsed.data;

    const organizationId = isSuperAdmin(user)
      ? ((request.body as Record<string, unknown>)?.organizationId as string | undefined)
      : (user.organizationId ?? undefined);

    if (!organizationId) {
      reply.code(403);
      return { error: "Organization required" };
    }

    const candidate = await db.candidate.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone ?? null,
        location: data.location ?? null,
        yearsOfExperience: data.yearsOfExperience,
        resumeId: data.resumeId ?? null,
        currentJobTitle: data.currentJobTitle ?? null,
        currentCompany: data.currentCompany ?? null,
        linkedinUrl: data.linkedinUrl ?? null,
        portfolioUrl: data.portfolioUrl ?? null,
        normalizedData: (data.normalizedData ?? {}) as object,
        status: data.status as CandidateStatus,
        organizationId,
        createdById: user.id,
      },
    });

    await logAuditEvent({
      action: "candidate.create",
      entityType: "candidate",
      entityId: candidate.id,
      actorId: user.id,
      actorEmail: user.email,
      organizationId,
      metadata: { name: candidate.name, email: candidate.email },
      ipAddress: getClientIp(request),
      userAgent: getClientUserAgent(request),
    });

    reply.code(201);
    return candidate;
  });

  server.patch("/api/v1/candidates/:id", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const user = getUser(request);

    const parsed = updateCandidateSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "Invalid input", details: parsed.error.flatten() };
    }
    const data = parsed.data;

    const existing = await db.candidate.findFirst({ where: { id, deletedAt: null, ...orgClause(user) } });
    if (!existing) {
      reply.code(404);
      return { error: "Candidate not found" };
    }

    if (data.resumeId !== undefined) {
      const resume = await db.resume.findFirst({ where: { id: data.resumeId, organizationId: existing.organizationId } });
      if (!resume) {
        reply.code(400);
        return { error: "Resume not found in this organization" };
      }
    }

    const candidate = await db.candidate.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.location !== undefined ? { location: data.location } : {}),
        ...(data.yearsOfExperience !== undefined ? { yearsOfExperience: data.yearsOfExperience } : {}),
        ...(data.resumeId !== undefined ? { resumeId: data.resumeId } : {}),
        ...(data.currentJobTitle !== undefined ? { currentJobTitle: data.currentJobTitle } : {}),
        ...(data.currentCompany !== undefined ? { currentCompany: data.currentCompany } : {}),
        ...(data.linkedinUrl !== undefined ? { linkedinUrl: data.linkedinUrl } : {}),
        ...(data.portfolioUrl !== undefined ? { portfolioUrl: data.portfolioUrl } : {}),
        ...(data.normalizedData !== undefined ? { normalizedData: data.normalizedData as object } : {}),
        ...(data.status !== undefined ? { status: data.status as CandidateStatus } : {}),
      },
    });

    await logAuditEvent({
      action: "candidate.update",
      entityType: "candidate",
      entityId: id,
      actorId: user.id,
      actorEmail: user.email,
      organizationId: existing.organizationId,
      metadata: { fields: Object.keys(data) },
      ipAddress: getClientIp(request),
      userAgent: getClientUserAgent(request),
    });

    return candidate;
  });

  server.delete("/api/v1/candidates/:id", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const user = getUser(request);

    const existing = await db.candidate.findFirst({ where: { id, deletedAt: null, ...orgClause(user) } });
    if (!existing) {
      reply.code(404);
      return { error: "Candidate not found" };
    }

    await db.candidate.update({ where: { id }, data: { deletedAt: new Date(), status: CandidateStatus.Archived } });

    await logAuditEvent({
      action: "candidate.delete",
      entityType: "candidate",
      entityId: id,
      actorId: user.id,
      actorEmail: user.email,
      organizationId: existing.organizationId,
      ipAddress: getClientIp(request),
      userAgent: getClientUserAgent(request),
    });

    reply.code(204);
    return;
  });
}