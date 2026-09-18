import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { createPrismaClient } from "@interviewed/database";
import { UserRole, MatchStatus, CandidateStatus } from "@interviewed/types";
import { createQueueConnection } from "@interviewed/queue";
import { config } from "@interviewed/config";
import { logAuditEvent } from "../services/audit";
import { getUser, isSuperAdmin, getPagination, paginate, getClientIp, getClientUserAgent, rateLimitSocketKeyGenerator } from "./utils";

const db = createPrismaClient();

function orgClause(user: { role: string; organizationId?: string | null }): { organizationId: string } | Record<string, never> {
  if (isSuperAdmin(user)) return {};
  return { organizationId: user.organizationId ?? "" };
}

const generateMatchSchema = z.object({
  candidateId: z.string().min(1),
  jobId: z.string().min(1),
});

const decideMatchSchema = z.object({
  decision: z.enum([MatchStatus.Approved, MatchStatus.Rejected]),
  note: z.string().max(2000).optional(),
});

export async function registerMatchRoutes(server: FastifyInstance): Promise<void> {
  server.post("/api/v1/matches/generate", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)], config: { rateLimit: { max: 20, timeWindow: "1 minute", keyGenerator: rateLimitSocketKeyGenerator } } }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(request);
    if (!isSuperAdmin(user) && !user.organizationId) {
      reply.code(403);
      return { error: "Organization required" };
    }

    const parsed = generateMatchSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "Invalid input", details: parsed.error.flatten() };
    }
    const { candidateId, jobId } = parsed.data;

    const organizationId = isSuperAdmin(user)
      ? ((request.body as Record<string, unknown>)?.organizationId as string | undefined)
      : (user.organizationId ?? undefined);

    if (!organizationId) {
      reply.code(403);
      return { error: "Organization required" };
    }

    const [candidate, job] = await Promise.all([
      db.candidate.findFirst({ where: { id: candidateId, deletedAt: null, organizationId } }),
      db.job.findFirst({ where: { id: jobId, deletedAt: null, organizationId } }),
    ]);
    if (!candidate) {
      reply.code(404);
      return { error: "Candidate not found in this organization" };
    }
    if (!job) {
      reply.code(404);
      return { error: "Job not found in this organization" };
    }

    const match = await db.candidateJobMatch.upsert({
      where: { candidateId_jobId: { candidateId, jobId } },
      create: {
        candidateId,
        jobId,
        overallScore: 0,
        skillScore: 0,
        experienceScore: 0,
        responsibilityScore: 0,
        qualificationScore: 0,
        domainScore: 0,
        strengths: [],
        gaps: [],
        missingRequirements: [],
        evidence: [],
        recommendation: "pending",
        status: MatchStatus.Pending,
      },
      update: { status: MatchStatus.Pending },
    });

    const aiJob = await db.aIProcessingJob.create({
      data: {
        type: "candidate_matching",
        status: "queued",
        organizationId,
        jobId,
        candidateId,
        payload: { candidateId, jobId },
      },
    });

    const queues = config.getRabbitMqQueues();
    const queue = createQueueConnection(config.getRabbitMqUrl());
    await queue.publish(queues.matching, {
      jobId,
      candidateId,
      organizationId,
      aiJobId: aiJob.id,
      matchId: match.id,
    });
    await queue.close();

    await logAuditEvent({
      action: "match.generate",
      entityType: "candidate_job_match",
      entityId: match.id,
      actorId: user.id,
      actorEmail: user.email,
      organizationId,
      metadata: { candidateId, jobId },
      ipAddress: getClientIp(request),
      userAgent: getClientUserAgent(request),
    });

    reply.code(202);
    return { matchId: match.id, jobId, candidateId, status: "queued" };
  });

  server.get("/api/v1/matches", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(request);
    if (!isSuperAdmin(user) && !user.organizationId) {
      reply.code(403);
      return { error: "Organization required" };
    }

    const query = request.query as Record<string, unknown>;
    const { page, limit, skip, take } = getPagination(query);
    const jobId = typeof query.jobId === "string" && query.jobId.length > 0 ? query.jobId : undefined;

    if (jobId) {
      const job = await db.job.findFirst({ where: { id: jobId, deletedAt: null, ...orgClause(user) } });
      if (!job) {
        reply.code(404);
        return { error: "Job not found" };
      }
    }

    const where = {
      ...(jobId ? { jobId } : {}),
      job: { is: orgClause(user) },
      status: typeof query.status === "string" && query.status.length > 0 ? (query.status as MatchStatus) : undefined,
    };

    const [matches, total] = await Promise.all([
      db.candidateJobMatch.findMany({
        where,
        skip,
        take,
        orderBy: [{ overallScore: "desc" }, { createdAt: "desc" }],
        include: {
          candidate: { select: { id: true, name: true, email: true, currentJobTitle: true, currentCompany: true } },
          job: { select: { id: true, title: true, slug: true } },
        },
      }),
      db.candidateJobMatch.count({ where }),
    ]);

    return paginate(matches, total, page, limit);
  });

  server.post("/api/v1/matches/:id/decide", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const user = getUser(request);

    const parsed = decideMatchSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "Invalid input", details: parsed.error.flatten() };
    }
    const { decision, note } = parsed.data;

    const match = await db.candidateJobMatch.findFirst({
      where: { id },
      include: { job: { select: { organizationId: true } }, candidate: true },
    });
    if (!match) {
      reply.code(404);
      return { error: "Match not found" };
    }
    if (!isSuperAdmin(user) && match.job.organizationId !== user.organizationId) {
      reply.code(404);
      return { error: "Match not found" };
    }

    const updated = await db.candidateJobMatch.update({
      where: { id },
      data: {
        status: decision as MatchStatus,
        hrDecision: { decision, note: note ?? null, by: user.id, at: new Date().toISOString() } as object,
        hrDecisionBy: user.id,
        hrDecisionAt: new Date(),
      },
    });

    await logAuditEvent({
      action: `match.decision.${decision}`,
      entityType: "candidate_job_match",
      entityId: id,
      actorId: user.id,
      actorEmail: user.email,
      organizationId: match.job.organizationId,
      metadata: { candidateId: match.candidateId, jobId: match.jobId, note },
      ipAddress: getClientIp(request),
      userAgent: getClientUserAgent(request),
    });

    if (decision === MatchStatus.Approved) {
      await db.candidate.update({
        where: { id: match.candidateId },
        data: { status: CandidateStatus.Shortlisted },
      });
    }

    return updated;
  });

  server.get("/api/v1/matches/ranking/:jobId", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { jobId } = request.params as { jobId: string };
    const user = getUser(request);
    if (!isSuperAdmin(user) && !user.organizationId) {
      reply.code(403);
      return { error: "Organization required" };
    }

    const job = await db.job.findFirst({ where: { id: jobId, deletedAt: null, ...orgClause(user) } });
    if (!job) {
      reply.code(404);
      return { error: "Job not found" };
    }

    const matches = await db.candidateJobMatch.findMany({
      where: { jobId },
      orderBy: [{ overallScore: "desc" }, { createdAt: "desc" }],
      include: { candidate: true },
    });

    return {
      jobId,
      ranking: matches.map((m, index) => ({
        rank: index + 1,
        matchId: m.id,
        candidate: {
          id: m.candidate.id,
          name: m.candidate.name,
          email: m.candidate.email,
          currentJobTitle: m.candidate.currentJobTitle,
          currentCompany: m.candidate.currentCompany,
        },
        scores: {
          overall: m.overallScore,
          skill: m.skillScore,
          experience: m.experienceScore,
          responsibility: m.responsibilityScore,
          qualification: m.qualificationScore,
          domain: m.domainScore,
        },
        strengths: m.strengths,
        gaps: m.gaps,
        missingRequirements: m.missingRequirements,
        recommendation: m.recommendation,
        status: m.status,
        hrDecision: m.hrDecision,
      })),
    };
  });
}