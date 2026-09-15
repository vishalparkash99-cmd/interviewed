import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import crypto from "crypto";
import { createPrismaClient } from "@interviewed/database";
import { UserRole, InterviewStatus, EmailType, EmailStatus, CandidateStatus } from "@interviewed/types";
import { createInterviewSchema } from "../validation";
import { createAIProvider, InterviewPlanner, antiPromptInjection } from "@interviewed/ai";
import { config } from "@interviewed/config";
import { createQueueConnection } from "@interviewed/queue";
import { logAuditEvent } from "../services/audit";
import { getUser, isSuperAdmin, getPagination, paginate, getClientIp, getClientUserAgent } from "./utils";

const db = createPrismaClient();

function orgClause(user: { role: string; organizationId?: string | null }): { organizationId: string } | Record<string, never> {
  if (isSuperAdmin(user)) return {};
  return { organizationId: user.organizationId ?? "" };
}

function getAIProvider() {
  const cfg = config.getAiConfig();
  return createAIProvider({
    provider: cfg.provider,
    apiKey: cfg.provider === "openai" ? cfg.openaiApiKey : cfg.provider === "openrouter" ? cfg.openrouterApiKey : cfg.anthropicApiKey,
    model: cfg.defaultModel,
  });
}

function getAppUrl(): string {
  return process.env.APP_URL || `http://localhost:${process.env.WEB_PORT || "3000"}`;
}

async function getInterviewContext(interviewId: string) {
  const interview = await db.interview.findUnique({ where: { id: interviewId }, include: { candidate: true, job: true } });
  if (!interview) return null;

  const match = await db.candidateJobMatch.findUnique({
    where: { candidateId_jobId: { candidateId: interview.candidateId, jobId: interview.jobId } },
  });

  return { interview, match };
}

async function buildInterviewPlan(interviewId: string): Promise<never[] | object[]> {
  try {
    const ctx = await getInterviewContext(interviewId);
    if (!ctx) return [];
    const { interview, match } = ctx;
    const job = interview.job;
    const candidate = interview.candidate;

    const requiredSkills = Array.isArray(job.requiredSkills) ? (job.requiredSkills as string[]) : [];
    const rawResponsibilities = Array.isArray(job.rolesResponsibilities) ? (job.rolesResponsibilities as unknown[]) : [];
    const rolesResponsibilities = rawResponsibilities.map((r) => {
      if (typeof r === "string") return { title: r, description: "" };
      const obj = r as Record<string, unknown>;
      return { title: String(obj.title ?? obj.label ?? ""), description: String(obj.description ?? "") };
    });

    const normalized = (candidate.normalizedData ?? {}) as Record<string, unknown>;
    const planner = new InterviewPlanner(getAIProvider());
    const plan = await planner.planInterview({
      jobTitle: job.title,
      jobDescription: job.description,
      requiredSkills,
      rolesResponsibilities,
      candidateResume: {
        name: candidate.name,
        yearsOfExperience: candidate.yearsOfExperience,
        skills: Array.isArray(normalized.skills) ? (normalized.skills as string[]) : [],
        experience: Array.isArray(normalized.experience) ? (normalized.experience as Array<{ title: string; company: string; summary: string }>) : [],
      },
      candidateMatchScore: match?.overallScore ?? 0,
      interviewDurationMinutes: interview.totalDuration,
      difficulty: job.interviewDifficulty || "medium",
    });

    const sections = (plan.sections || []).map((section) => ({
      section: section.section,
      title: section.title,
      durationMinutes: section.durationMinutes,
      questions: (section.questions || []).map((q) => ({
        text: q.text,
        type: q.type,
        difficulty: q.difficulty,
        durationMinutes: q.durationMinutes,
      })),
    }));

    await db.interviewQuestion.createMany({
      data: sections.flatMap((section, si) =>
        section.questions.map((q, qi) => ({
          interviewId,
          section: section.section,
          question: q.text,
          type: q.type,
          difficulty: q.difficulty,
          sequence: si * 100 + qi,
        }))
      ),
    });

    return sections;
  } catch {
    return [];
  }
}

const createQuestionSchema = z.object({
  section: z.string().min(1).max(100),
  question: z.string().min(1),
  type: z.string().min(1).max(50),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  isFollowUp: z.boolean().optional(),
  context: z.record(z.unknown()).optional(),
  followUpToId: z.string().optional(),
});

const submitAnswerSchema = z.object({
  interviewToken: z.string().min(1),
  questionId: z.string().min(1),
  answer: z.string().min(1).max(12000),
  durationSeconds: z.number().min(0).max(3600).default(0),
  confidence: z.number().min(0).max(100).default(50),
});

const joinInterviewSchema = z.object({
  interviewToken: z.string().min(1),
});

export async function registerInterviewRoutes(server: FastifyInstance): Promise<void> {
  server.get("/api/v1/interviews", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(request);
    if (!isSuperAdmin(user) && !user.organizationId) {
      reply.code(403);
      return { error: "Organization required" };
    }

    const query = request.query as Record<string, unknown>;
    const { page, limit, skip, take } = getPagination(query);

    const status = typeof query.status === "string" && query.status.length > 0 ? query.status : undefined;
    const where = {
      ...orgClause(user),
      ...(status ? { status: status as InterviewStatus } : {}),
    };

    const [interviews, total] = await Promise.all([
      db.interview.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          candidate: { select: { id: true, name: true, email: true } },
          job: { select: { id: true, title: true, slug: true } },
        },
      }),
      db.interview.count({ where }),
    ]);

    return paginate(interviews, total, page, limit);
  });

  server.get("/api/v1/interviews/:id", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const user = getUser(request);
    if (!isSuperAdmin(user) && !user.organizationId) {
      reply.code(403);
      return { error: "Organization required" };
    }

    const interview = await db.interview.findFirst({
      where: { id, ...orgClause(user) },
      include: {
        candidate: { include: { resume: true } },
        job: { include: { organization: { select: { name: true } } } },
        questions: { orderBy: { sequence: "asc" } },
        answers: { orderBy: { createdAt: "asc" } },
        transcriptSegments: { orderBy: { timestamp: "asc" } },
        evaluation: true,
        report: true,
      },
    });
    if (!interview) {
      reply.code(404);
      return { error: "Interview not found" };
    }
    return interview;
  });

  server.post("/api/v1/interviews", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(request);

    const parsed = createInterviewSchema.safeParse(request.body);
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

    const [candidate, job] = await Promise.all([
      db.candidate.findFirst({ where: { id: data.candidateId, deletedAt: null, organizationId } }),
      db.job.findFirst({ where: { id: data.jobId, deletedAt: null, organizationId } }),
    ]);
    if (!candidate) {
      reply.code(400);
      return { error: "Candidate not found in this organization" };
    }
    if (!job) {
      reply.code(400);
      return { error: "Job not found in this organization" };
    }

    const interview = await db.interview.create({
      data: {
        candidateId: data.candidateId,
        jobId: data.jobId,
        interviewKey: crypto.randomUUID(),
        secureToken: crypto.randomUUID(),
        status: InterviewStatus.Scheduled,
        totalDuration: data.duration,
        recordingConsent: data.recordingConsent,
        recordingDisclosed: data.recordingDisclosed,
        deviceInfo: (data.deviceInfo ?? {}) as object,
        ipAddress: getClientIp(request),
        organizationId,
        plan: [],
      },
    });

    const plan = await buildInterviewPlan(interview.id);
    await db.interview.update({ where: { id: interview.id }, data: { plan: plan as object, currentSectionIndex: 0 } });

    await logAuditEvent({
      action: "interview.create",
      entityType: "interview",
      entityId: interview.id,
      actorId: user.id,
      actorEmail: user.email,
      organizationId,
      metadata: { candidateId: data.candidateId, jobId: data.jobId },
      ipAddress: getClientIp(request),
      userAgent: getClientUserAgent(request),
    });

    if (candidate.status === CandidateStatus.Active) {
      await db.candidate.update({ where: { id: candidate.id }, data: { status: CandidateStatus.Screened } });
    }

    reply.code(201);
    return {
      ...interview,
      plan,
      interviewLink: `${getAppUrl()}/portal?token=${interview.secureToken}`,
    };
  });

  server.post("/api/v1/interviews/:id/start", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const user = getUser(request);

    const existing = await db.interview.findFirst({ where: { id, ...orgClause(user) } });
    if (!existing) {
      reply.code(404);
      return { error: "Interview not found" };
    }
    if (existing.status === InterviewStatus.Cancelled) {
      reply.code(409);
      return { error: "Cannot start a cancelled interview" };
    }

    const interview = await db.interview.update({
      where: { id },
      data: { status: InterviewStatus.InProgress, startedAt: existing.startedAt ?? new Date() },
    });

    await logAuditEvent({
      action: "interview.start",
      entityType: "interview",
      entityId: id,
      actorId: user.id,
      actorEmail: user.email,
      organizationId: existing.organizationId,
      ipAddress: getClientIp(request),
      userAgent: getClientUserAgent(request),
    });

    return interview;
  });

  server.post("/api/v1/interviews/:id/end", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const user = getUser(request);

    const existing = await db.interview.findFirst({ where: { id, ...orgClause(user) } });
    if (!existing) {
      reply.code(404);
      return { error: "Interview not found" };
    }
    if (existing.status !== InterviewStatus.InProgress && existing.status !== InterviewStatus.Scheduled) {
      reply.code(409);
      return { error: "Interview is not in progress" };
    }

    const interview = await db.interview.update({
      where: { id },
      data: { status: InterviewStatus.Completed, endedAt: new Date() },
    });

    await logAuditEvent({
      action: "interview.end",
      entityType: "interview",
      entityId: id,
      actorId: user.id,
      actorEmail: user.email,
      organizationId: existing.organizationId,
      ipAddress: getClientIp(request),
      userAgent: getClientUserAgent(request),
    });

    return interview;
  });

  server.post("/api/v1/interviews/:id/cancel", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const user = getUser(request);

    const existing = await db.interview.findFirst({ where: { id, ...orgClause(user) } });
    if (!existing) {
      reply.code(404);
      return { error: "Interview not found" };
    }
    if (existing.status === InterviewStatus.Completed) {
      reply.code(409);
      return { error: "Cannot cancel a completed interview" };
    }

    const interview = await db.interview.update({
      where: { id },
      data: { status: InterviewStatus.Cancelled, endedAt: existing.endedAt ?? new Date() },
    });

    await logAuditEvent({
      action: "interview.cancel",
      entityType: "interview",
      entityId: id,
      actorId: user.id,
      actorEmail: user.email,
      organizationId: existing.organizationId,
      ipAddress: getClientIp(request),
      userAgent: getClientUserAgent(request),
    });

    return interview;
  });

  server.post("/api/v1/interviews/:id/invite", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const user = getUser(request);

    const interview = await db.interview.findFirst({
      where: { id, ...orgClause(user) },
      include: { candidate: true, job: true },
    });
    if (!interview) {
      reply.code(404);
      return { error: "Interview not found" };
    }

    const secureToken = crypto.randomUUID();
    const linkExpiryHours = config.getInterviewConfig().linkExpiryHours;
    const expiresAt = new Date(Date.now() + linkExpiryHours * 60 * 60 * 1000);

    await db.interview.update({ where: { id }, data: { secureToken } });

    const interviewLink = `${getAppUrl()}/portal?token=${secureToken}`;
    const subject = `Interview invitation - ${interview.job.title}`;
    const body = `<p>Hi ${interview.candidate.name},</p><p>You have been invited to an interview for the role of <strong>${interview.job.title}</strong>. Please use the link below to join:</p><p><a href="${interviewLink}">${interviewLink}</a></p>`;

    await db.email.create({
      data: {
        type: EmailType.Invitation,
        recipient: interview.candidate.email,
        recipientName: interview.candidate.name,
        subject,
        body,
        template: "interview_invitation",
        templateData: { interviewLink, candidateName: interview.candidate.name, jobTitle: interview.job.title, expiresAt: expiresAt.toISOString() },
        status: EmailStatus.Pending,
        jobId: interview.jobId,
        candidateId: interview.candidateId,
        interviewId: interview.id,
        organizationId: interview.organizationId,
      },
    });

    await logAuditEvent({
      action: "interview.invite",
      entityType: "interview",
      entityId: id,
      actorId: user.id,
      actorEmail: user.email,
      organizationId: interview.organizationId,
      metadata: { expiresAt: expiresAt.toISOString() },
      ipAddress: getClientIp(request),
      userAgent: getClientUserAgent(request),
    });

    return { link: interviewLink, token: secureToken, expiresAt };
  });

  server.post("/api/v1/interviews/:id/questions", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const user = getUser(request);

    const parsed = createQuestionSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "Invalid input", details: parsed.error.flatten() };
    }
    const data = parsed.data;

    const interview = await db.interview.findFirst({ where: { id, ...orgClause(user) } });
    if (!interview) {
      reply.code(404);
      return { error: "Interview not found" };
    }

    const lastQuestion = await db.interviewQuestion.findFirst({
      where: { interviewId: id },
      orderBy: { sequence: "desc" },
    });

    const question = await db.interviewQuestion.create({
      data: {
        interviewId: id,
        section: data.section,
        question: data.question,
        type: data.type,
        difficulty: data.difficulty,
        isFollowUp: data.isFollowUp ?? false,
        followUpToId: data.followUpToId ?? null,
        context: (data.context ?? {}) as object,
        sequence: (lastQuestion?.sequence ?? 0) + 1,
      },
    });

    await logAuditEvent({
      action: "interview.question.create",
      entityType: "interview_question",
      entityId: question.id,
      actorId: user.id,
      actorEmail: user.email,
      organizationId: interview.organizationId,
      metadata: { interviewId: id, section: data.section },
      ipAddress: getClientIp(request),
      userAgent: getClientUserAgent(request),
    });

    reply.code(201);
    return question;
  });

  server.get("/api/v1/interviews/:id/transcript", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const user = getUser(request);

    const interview = await db.interview.findFirst({ where: { id, ...orgClause(user) } });
    if (!interview) {
      reply.code(404);
      return { error: "Interview not found" };
    }

    const segments = await db.transcriptSegment.findMany({
      where: { interviewId: id },
      orderBy: { timestamp: "asc" },
    });

    return { data: segments };
  });

  server.post("/api/v1/interviews/candidate/join", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = joinInterviewSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "interviewToken is required" };
    }

    const interview = await db.interview.findUnique({
      where: { secureToken: parsed.data.interviewToken },
      include: { candidate: true, job: { include: { organization: true } }, questions: { orderBy: { sequence: "asc" } } },
    });
    if (!interview) {
      reply.code(404);
      return { error: "Interview not found" };
    }
    if (interview.status === InterviewStatus.Cancelled) {
      reply.code(403);
      return { error: "This interview has been cancelled" };
    }
    if (interview.status === InterviewStatus.Completed) {
      reply.code(403);
      return { error: "This interview has already been completed" };
    }

    const firstName = interview.candidate.name.split(" ")[0] || "Candidate";
    const currentQuestion = interview.questions.find((q) => !q.isFollowUp && q.sequence === Math.min(...interview.questions.filter((x) => !x.isFollowUp).map((x) => x.sequence), 0)) || interview.questions[0] || null;

    return {
      interviewId: interview.id,
      candidateName: interview.candidate.name,
      jobTitle: interview.job.title,
      duration: interview.totalDuration,
      currentQuestion: currentQuestion
        ? { id: currentQuestion.id, text: currentQuestion.question, section: currentQuestion.section }
        : null,
      interview: {
        id: interview.id,
        status: interview.status,
        totalDuration: interview.totalDuration,
        elapsedSeconds: interview.elapsedSeconds,
        recordingConsent: interview.recordingConsent,
        recordingDisclosed: interview.recordingDisclosed,
        startedAt: interview.startedAt,
      },
      candidate: {
        id: interview.candidate.id,
        name: interview.candidate.name,
        email: interview.candidate.email,
        firstName,
      },
      job: {
        id: interview.job.id,
        title: interview.job.title,
        department: interview.job.department,
        description: interview.job.description,
        organization: interview.job.organization.name,
      },
    };
  });

  server.get("/api/v1/interviews/secure/:token", async (request: FastifyRequest, reply: FastifyReply) => {
    const { token } = request.params as { token: string };
    const interview = await db.interview.findUnique({
      where: { secureToken: token },
      select: { id: true, status: true, candidateId: true, jobId: true, organizationId: true },
    });
    if (!interview) {
      reply.code(404);
      return { error: "Invalid interview token" };
    }
    return { valid: true, ...interview };
  });

  server.post("/api/v1/interviews/candidate/:id/answer", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const parsed = submitAnswerSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "Invalid input", details: parsed.error.flatten() };
    }
    const data = parsed.data;

    const interview = await db.interview.findUnique({
      where: { secureToken: data.interviewToken },
      include: { job: true },
    });
    if (!interview || interview.id !== id) {
      reply.code(404);
      return { error: "Interview not found" };
    }
    if (interview.status === InterviewStatus.Cancelled || interview.status === InterviewStatus.Completed) {
      reply.code(403);
      return { error: "This interview is no longer accepting answers" };
    }

    const question = await db.interviewQuestion.findFirst({ where: { id: data.questionId, interviewId: id } });
    if (!question) {
      reply.code(400);
      return { error: "Question not found for this interview" };
    }

    const securedAnswer = antiPromptInjection(data.answer) ? data.answer.slice(0, 4000) : data.answer;

    const answer = await db.interviewAnswer.create({
      data: {
        interviewId: id,
        questionId: question.id,
        answer: securedAnswer,
        durationSeconds: data.durationSeconds,
        confidence: data.confidence,
      },
    });

    await db.interview.update({
      where: { id },
      data: {
        elapsedSeconds: { increment: data.durationSeconds },
        ...(interview.totalDuration > 0 && interview.elapsedSeconds + data.durationSeconds > interview.totalDuration
          ? { status: InterviewStatus.Completed, endedAt: new Date() }
          : {}),
      },
    });

    let nextQuestion = null;
    const isComplete = interview.totalDuration > 0 && (interview.elapsedSeconds ?? 0) + data.durationSeconds >= interview.totalDuration;

    if (!isComplete) {
      const topic = [interview.job.title, question.section, question.type].filter(Boolean).join(" ");
      if (antiPromptInjection(topic) === false) {
        try {
          const planner = new InterviewPlanner(getAIProvider());
          const text = await planner.generateQuestion(topic, question.difficulty || "medium", {
            previousQuestion: question.question,
            section: question.section,
          });

          const lastQuestion = await db.interviewQuestion.findFirst({
            where: { interviewId: id },
            orderBy: { sequence: "desc" },
          });

          nextQuestion = await db.interviewQuestion.create({
            data: {
              interviewId: id,
              section: question.section,
              question: text,
              type: "follow-up",
              difficulty: question.difficulty || "medium",
              isFollowUp: true,
              followUpToId: question.id,
              sequence: (lastQuestion?.sequence ?? 0) + 1,
            },
          });
        } catch {
          nextQuestion = null;
        }
      }
    }

    await db.transcriptSegment.create({
      data: { interviewId: id, speaker: "candidate", timestamp: new Date(), text: securedAnswer, segmentType: "answer", competency: question.section ?? null },
    });
    if (nextQuestion) {
      await db.transcriptSegment.create({
        data: { interviewId: id, speaker: "ai", timestamp: new Date(), text: nextQuestion.question, segmentType: "question", competency: question.section ?? null },
      });
    }

    return {
      answer,
      nextQuestion: nextQuestion
        ? { id: nextQuestion.id, text: nextQuestion.question, section: nextQuestion.section }
        : null,
      interviewComplete: isComplete,
      completed: isComplete,
    };
  });

  // Trigger AI evaluation for a completed interview
  server.post("/api/v1/interviews/:id/evaluate", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const user = getUser(request);

    const interview = await db.interview.findFirst({ where: { id, ...orgClause(user) } });
    if (!interview) {
      reply.code(404);
      return { error: "Interview not found" };
    }
    if (interview.status !== InterviewStatus.Completed) {
      reply.code(409);
      return { error: "Interview must be completed before evaluation" };
    }
    if (interview.organizationId && !isSuperAdmin(user) && interview.organizationId !== user.organizationId) {
      reply.code(404);
      return { error: "Interview not found" };
    }

    const aiJob = await db.aIProcessingJob.create({
      data: {
        type: "ai_evaluation",
        status: "queued",
        organizationId: interview.organizationId,
        jobId: interview.jobId,
        candidateId: interview.candidateId,
        payload: { interviewId: id },
      },
    });

    const queue = createQueueConnection(config.getRabbitMqUrl());
    const queues = config.getRabbitMqQueues();
    await queue.publish(queues.aiEvaluation, { interviewId: id, aiJobId: aiJob.id, organizationId: interview.organizationId });
    await queue.close();

    await logAuditEvent({
      action: "interview.evaluate",
      entityType: "interview",
      entityId: id,
      actorId: user.id,
      actorEmail: user.email,
      organizationId: interview.organizationId ?? undefined,
      metadata: { aiJobId: aiJob.id },
      ipAddress: getClientIp(request),
      userAgent: getClientUserAgent(request),
    });

    reply.code(202);
    return { ok: true, status: "queued", aiJobId: aiJob.id };
  });

  // Trigger HR report generation
  server.post("/api/v1/interviews/:id/generate-report", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const user = getUser(request);

    const interview = await db.interview.findFirst({ where: { id, ...orgClause(user) } });
    if (!interview) {
      reply.code(404);
      return { error: "Interview not found" };
    }
    if (interview.organizationId && !isSuperAdmin(user) && interview.organizationId !== user.organizationId) {
      reply.code(404);
      return { error: "Interview not found" };
    }
    if (interview.status !== InterviewStatus.Completed) {
      reply.code(409);
      return { error: "Interview must be completed before generating a report" };
    }

    const existing = await db.interviewReport.findUnique({ where: { interviewId: id } });
    if (existing) {
      reply.code(409);
      return { error: "Report already exists for this interview", reportId: existing.id };
    }

    const aiJob = await db.aIProcessingJob.create({
      data: {
        type: "report_generation",
        status: "queued",
        organizationId: interview.organizationId,
        jobId: interview.jobId,
        candidateId: interview.candidateId,
        payload: { interviewId: id },
      },
    });

    const queue = createQueueConnection(config.getRabbitMqUrl());
    const queues = config.getRabbitMqQueues();
    await queue.publish(queues.report, { interviewId: id, aiJobId: aiJob.id, organizationId: interview.organizationId });
    await queue.close();

    await logAuditEvent({
      action: "interview.report.generate",
      entityType: "interview",
      entityId: id,
      actorId: user.id,
      actorEmail: user.email,
      organizationId: interview.organizationId ?? undefined,
      metadata: { aiJobId: aiJob.id },
      ipAddress: getClientIp(request),
      userAgent: getClientUserAgent(request),
    });

    reply.code(202);
    return { ok: true, status: "queued", aiJobId: aiJob.id };
  });
}