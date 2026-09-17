import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { createPrismaClient } from "@interviewed/database";
import { UserRole, JobStatus } from "@interviewed/types";
import { createJobSchema, updateJobSchema } from "../validation";
import { logAuditEvent } from "../services/audit";
import { getUser, isSuperAdmin, getPagination, paginate, slugify, getClientIp, getClientUserAgent } from "./utils";

const db = createPrismaClient();

const VALID_ACTIVATION = new Set([JobStatus.Draft, JobStatus.Paused]);
const VALID_CLOSE = new Set([JobStatus.Active, JobStatus.Paused]);
const VALID_PAUSE = new Set([JobStatus.Active, JobStatus.Draft]);

async function uniqueJobSlug(title: string): Promise<string> {
  let slug = slugify(title);
  let n = 1;
  while (await db.job.findUnique({ where: { slug } })) {
    slug = `${slugify(title)}-${n++}`;
  }
  return slug;
}

function orgClause(user: { role: string; organizationId?: string | null }): { organizationId: string } | Record<string, never> {
  if (isSuperAdmin(user)) return {};
  return { organizationId: user.organizationId ?? "" };
}

export async function registerJobRoutes(server: FastifyInstance): Promise<void> {
  server.get("/api/v1/jobs", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(request);
    if (!isSuperAdmin(user) && !user.organizationId) {
      reply.code(403);
      return { error: "Organization required" };
    }

    const query = request.query as Record<string, unknown>;
    const { page, limit, skip, take } = getPagination(query);

    const status = typeof query.status === "string" && query.status.length > 0 ? query.status : undefined;
    const where = {
      deletedAt: null,
      ...orgClause(user),
      ...(status ? { status: status as JobStatus } : {}),
    };

    const [jobs, total] = await Promise.all([
      db.job.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          owner: { select: { id: true, email: true, firstName: true, lastName: true } },
          organization: { select: { id: true, name: true, slug: true } },
          _count: { select: { interviews: true, matches: true } },
        },
      }),
      db.job.count({ where }),
    ]);

    return paginate(jobs, total, page, limit);
  });

  server.get("/api/v1/jobs/:id", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const user = getUser(request);
    if (!isSuperAdmin(user) && !user.organizationId) {
      reply.code(403);
      return { error: "Organization required" };
    }

    const job = await db.job.findFirst({
      where: { id, deletedAt: null, ...orgClause(user) },
      include: {
        owner: { select: { id: true, email: true, firstName: true, lastName: true } },
        organization: { select: { id: true, name: true, slug: true } },
        interviews: { select: { id: true, status: true, createdAt: true } },
        matches: { select: { id: true, candidateId: true, overallScore: true, status: true } },
      },
    });
    if (!job) {
      reply.code(404);
      return { error: "Job not found" };
    }
    return job;
  });

  server.post("/api/v1/jobs", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(request);
    const parsed = createJobSchema.safeParse(request.body);
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

    const organization = await db.organization.findFirst({ where: { id: organizationId, deletedAt: null } });
    if (!organization) {
      reply.code(400);
      return { error: "Organization not found" };
    }

    const slug = await uniqueJobSlug(data.title);

    const job = await db.job.create({
      data: {
        title: data.title,
        slug,
        description: data.description,
        department: data.department ?? null,
        location: data.location ?? null,
        employmentType: data.employmentType,
        experienceMinYears: data.experienceMinYears,
        experienceMaxYears: data.experienceMaxYears,
        rolesResponsibilities: (data.rolesResponsibilities ?? []) as object,
        requiredSkills: (data.requiredSkills ?? []) as object,
        preferredSkills: (data.preferredSkills ?? []) as object,
        requiredQualifications: (data.requiredQualifications ?? []) as object,
        preferredQualifications: (data.preferredQualifications ?? []) as object,
        domain: data.domain ?? null,
        customScreeningCriteria: (data.customScreeningCriteria ?? {}) as object,
        interviewDuration: data.interviewDuration,
        interviewDifficulty: data.interviewDifficulty,
        shortlistCount: data.shortlistCount,
        minimumScreeningScore: data.minimumScreeningScore,
        scoringWeights: (data.scoringWeights ?? {}) as object,
        interviewConfig: (data.interviewConfig ?? {}) as object,
        status: JobStatus.Draft,
        organizationId,
        ownerId: user.id,
      },
    });

    await logAuditEvent({
      action: "job.create",
      entityType: "job",
      entityId: job.id,
      actorId: user.id,
      actorEmail: user.email,
      organizationId,
      metadata: { title: job.title, slug: job.slug },
      ipAddress: getClientIp(request),
      userAgent: getClientUserAgent(request),
    });

    reply.code(201);
    return job;
  });

  server.patch("/api/v1/jobs/:id", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const user = getUser(request);

    const parsed = updateJobSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "Invalid input", details: parsed.error.flatten() };
    }
    const data = parsed.data;

    const existing = await db.job.findFirst({ where: { id, deletedAt: null, ...orgClause(user) } });
    if (!existing) {
      reply.code(404);
      return { error: "Job not found" };
    }

    const job = await db.job.update({
      where: { id },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.department !== undefined ? { department: data.department } : {}),
        ...(data.location !== undefined ? { location: data.location } : {}),
        ...(data.employmentType !== undefined ? { employmentType: data.employmentType } : {}),
        ...(data.experienceMinYears !== undefined ? { experienceMinYears: data.experienceMinYears } : {}),
        ...(data.experienceMaxYears !== undefined ? { experienceMaxYears: data.experienceMaxYears } : {}),
        ...(data.rolesResponsibilities !== undefined ? { rolesResponsibilities: data.rolesResponsibilities as object } : {}),
        ...(data.requiredSkills !== undefined ? { requiredSkills: data.requiredSkills as object } : {}),
        ...(data.preferredSkills !== undefined ? { preferredSkills: data.preferredSkills as object } : {}),
        ...(data.requiredQualifications !== undefined ? { requiredQualifications: data.requiredQualifications as object } : {}),
        ...(data.preferredQualifications !== undefined ? { preferredQualifications: data.preferredQualifications as object } : {}),
        ...(data.domain !== undefined ? { domain: data.domain } : {}),
        ...(data.customScreeningCriteria !== undefined ? { customScreeningCriteria: data.customScreeningCriteria as object } : {}),
        ...(data.interviewDuration !== undefined ? { interviewDuration: data.interviewDuration } : {}),
        ...(data.interviewDifficulty !== undefined ? { interviewDifficulty: data.interviewDifficulty } : {}),
        ...(data.shortlistCount !== undefined ? { shortlistCount: data.shortlistCount } : {}),
        ...(data.minimumScreeningScore !== undefined ? { minimumScreeningScore: data.minimumScreeningScore } : {}),
        ...(data.scoringWeights !== undefined ? { scoringWeights: data.scoringWeights as object } : {}),
        ...(data.interviewConfig !== undefined ? { interviewConfig: data.interviewConfig as object } : {}),
      },
    });

    await logAuditEvent({
      action: "job.update",
      entityType: "job",
      entityId: id,
      actorId: user.id,
      actorEmail: user.email,
      organizationId: existing.organizationId,
      metadata: { fields: Object.keys(data) },
      ipAddress: getClientIp(request),
      userAgent: getClientUserAgent(request),
    });

    return job;
  });

  server.delete("/api/v1/jobs/:id", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const user = getUser(request);

    const existing = await db.job.findFirst({ where: { id, deletedAt: null, ...orgClause(user) } });
    if (!existing) {
      reply.code(404);
      return { error: "Job not found" };
    }

    await db.job.update({ where: { id }, data: { deletedAt: new Date() } });

    await logAuditEvent({
      action: "job.delete",
      entityType: "job",
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

  const transitionChange = async (
    request: FastifyRequest,
    reply: FastifyReply,
    from: Set<JobStatus>,
    to: JobStatus
  ) => {
    const { id } = request.params as { id: string };
    const user = getUser(request);

    const existing = await db.job.findFirst({ where: { id, deletedAt: null, ...orgClause(user) } });
    if (!existing) {
      reply.code(404);
      return { error: "Job not found" };
    }
    if (!from.has(existing.status as JobStatus)) {
      reply.code(409);
      return { error: `Cannot transition job from "${existing.status}" to "${to}"`, currentStatus: existing.status };
    }

    const job = await db.job.update({ where: { id }, data: { status: to } });

    await logAuditEvent({
      action: `job.${to}`,
      entityType: "job",
      entityId: id,
      actorId: user.id,
      actorEmail: user.email,
      organizationId: existing.organizationId,
      metadata: { from: existing.status, to },
      ipAddress: getClientIp(request),
      userAgent: getClientUserAgent(request),
    });

    return job;
  };

  server.post("/api/v1/jobs/:id/activate", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    return transitionChange(request, reply, VALID_ACTIVATION, JobStatus.Active);
  });

  server.post("/api/v1/jobs/:id/close", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    return transitionChange(request, reply, VALID_CLOSE, JobStatus.Closed);
  });

  server.post("/api/v1/jobs/:id/pause", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    return transitionChange(request, reply, VALID_PAUSE, JobStatus.Paused);
  });

  server.post("/api/v1/jobs/:id/status", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const user = getUser(request);

    const parsedBody = z.object({ status: z.enum([JobStatus.Draft, JobStatus.Active, JobStatus.Paused, JobStatus.Closed]) }).safeParse(request.body);
    if (!parsedBody.success) {
      reply.code(400);
      return { error: "Invalid status" };
    }

    const existing = await db.job.findFirst({ where: { id, deletedAt: null, ...orgClause(user) } });
    if (!existing) {
      reply.code(404);
      return { error: "Job not found" };
    }

    const job = await db.job.update({ where: { id }, data: { status: parsedBody.data.status } });

    await logAuditEvent({
      action: "job.status_change",
      entityType: "job",
      entityId: id,
      actorId: user.id,
      actorEmail: user.email,
      organizationId: existing.organizationId,
      metadata: { from: existing.status, to: parsedBody.data.status },
      ipAddress: getClientIp(request),
      userAgent: getClientUserAgent(request),
    });

    return job;
  });
}