import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import crypto from "crypto";
import { createPrismaClient } from "@interviewed/database";
import { UserRole, InterviewStatus, EmailType, CandidateStatus } from "@interviewed/types";
import { createInterviewSchema, createQuestionSchema, submitAnswerSchema, joinInterviewSchema, rescheduleInterviewSchema, completeInterviewSchema } from "../validation";
import { createAIProvider, InterviewPlanner, antiPromptInjection, sanitizeInput } from "@interviewed/ai";
import { config } from "@interviewed/config";
import { createQueueConnection } from "@interviewed/queue";
import { logAuditEvent } from "../services/audit";
import { enqueueEmail } from "../services/email-dispatch";
import { getUser, isSuperAdmin, getPagination, paginate, getClientIp, getClientUserAgent, rateLimitSocketKeyGenerator } from "./utils";

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

function interviewLinkFor(token: string): string {
  return `${getAppUrl()}/portal?token=${token}`;
}

async function dispatchInterviewEmail(opts: {
  interview: {
    id: string;
    jobId: string;
    candidateId: string;
    organizationId: string;
    candidate: { name: string; email: string };
    job: { title: string };
  };
  type: EmailType;
  subject: string;
  body: string;
  template: string;
  templateData: Record<string, unknown>;
}): Promise<void> {
  await enqueueEmail({
    type: opts.type,
    recipient: opts.interview.candidate.email,
    recipientName: opts.interview.candidate.name,
    subject: opts.subject,
    body: opts.body,
    template: opts.template,
    templateData: opts.templateData,
    jobId: opts.interview.jobId,
    candidateId: opts.interview.candidateId,
    interviewId: opts.interview.id,
    organizationId: opts.interview.organizationId,
  });
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

const MAX_FOLLOW_UP_QUESTIONS_PER_INTERVIEW = 5;

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

  server.post("/api/v1/interviews", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)], config: { rateLimit: { max: 20, timeWindow: "1 minute", keyGenerator: rateLimitSocketKeyGenerator } } }, async (request: FastifyRequest, reply: FastifyReply) => {
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

    if (isSuperAdmin(user) && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organizationId)) {
      reply.code(400);
      return { error: "Invalid organizationId" };
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

    const existing = await db.interview.findFirst({ where: { id, ...orgClause(user) }, include: { candidate: true, job: true } });
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

    await dispatchInterviewEmail({
      interview: existing,
      type: EmailType.Completion,
      subject: `Interview completed - ${existing.job.title}`,
      body: `<p>Hi ${existing.candidate.name},</p><p>Thank you for completing the interview for the role of <strong>${existing.job.title}</strong>. We will be in touch with the outcome shortly.</p>`,
      template: "interview_completion",
      templateData: { candidateName: existing.candidate.name, jobTitle: existing.job.title },
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

    const existing = await db.interview.findFirst({ where: { id, ...orgClause(user) }, include: { candidate: true, job: true } });
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

    await dispatchInterviewEmail({
      interview: existing,
      type: EmailType.Cancellation,
      subject: `Interview cancelled - ${existing.job.title}`,
      body: `<p>Hi ${existing.candidate.name},</p><p>Your interview for the role of <strong>${existing.job.title}</strong> has been cancelled. We apologise for any inconvenience.</p>`,
      template: "interview_cancellation",
      templateData: { candidateName: existing.candidate.name, jobTitle: existing.job.title },
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

    await db.interview.update({ where: { id }, data: { secureToken, inviteExpiresAt: expiresAt } });

    const interviewLink = interviewLinkFor(secureToken);
    const subject = `Interview invitation - ${interview.job.title}`;
    const body = `<p>Hi ${interview.candidate.name},</p><p>You have been invited to an interview for the role of <strong>${interview.job.title}</strong>. Please use the link below to join:</p><p><a href="${interviewLink}">${interviewLink}</a></p><p>This link expires on ${expiresAt.toUTCString()}.</p>`;

    await dispatchInterviewEmail({
      interview,
      type: EmailType.Invitation,
      subject,
      body,
      template: "interview_invitation",
      templateData: { interviewLink, candidateName: interview.candidate.name, jobTitle: interview.job.title, expiresAt: expiresAt.toISOString() },
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

  server.post("/api/v1/interviews/:id/remind", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)] }, async (request: FastifyRequest, reply: FastifyReply) => {
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
    if (interview.status === InterviewStatus.Completed || interview.status === InterviewStatus.Cancelled) {
      reply.code(409);
      return { error: "Interview is not open for reminders" };
    }

    const secureToken = crypto.randomUUID();
    const linkExpiryHours = config.getInterviewConfig().linkExpiryHours;
    const expiresAt = new Date(Date.now() + linkExpiryHours * 60 * 60 * 1000);

    await db.interview.update({ where: { id }, data: { secureToken, inviteExpiresAt: expiresAt } });

    const interviewLink = interviewLinkFor(secureToken);
    const subject = `Reminder: Interview for ${interview.job.title}`;
    const body = `<p>Hi ${interview.candidate.name},</p><p>This is a reminder about your upcoming interview for the role of <strong>${interview.job.title}</strong>. Please use the link below to join:</p><p><a href="${interviewLink}">${interviewLink}</a></p><p>This link expires on ${expiresAt.toUTCString()}.</p>`;

    await dispatchInterviewEmail({
      interview,
      type: EmailType.Reminder,
      subject,
      body,
      template: "interview_reminder",
      templateData: { interviewLink, candidateName: interview.candidate.name, jobTitle: interview.job.title, expiresAt: expiresAt.toISOString() },
    });

    await logAuditEvent({
      action: "interview.remind",
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

  server.post("/api/v1/interviews/:id/reschedule", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const user = getUser(request);

    const parsed = rescheduleInterviewSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400);
      return { error: "Invalid input", details: parsed.error.flatten() };
    }
    const duration = parsed.data.duration;

    const interview = await db.interview.findFirst({
      where: { id, ...orgClause(user) },
      include: { candidate: true, job: true },
    });
    if (!interview) {
      reply.code(404);
      return { error: "Interview not found" };
    }
    if (interview.status === InterviewStatus.Completed || interview.status === InterviewStatus.Cancelled) {
      reply.code(409);
      return { error: "Cannot reschedule a completed or cancelled interview" };
    }

    const secureToken = crypto.randomUUID();
    const linkExpiryHours = config.getInterviewConfig().linkExpiryHours;
    const expiresAt = new Date(Date.now() + linkExpiryHours * 60 * 60 * 1000);
    const totalDuration = duration ?? interview.totalDuration;

    await db.interview.update({
      where: { id },
      data: { secureToken, inviteExpiresAt: expiresAt, totalDuration },
    });

    const interviewLink = interviewLinkFor(secureToken);
    const subject = `Interview rescheduled - ${interview.job.title}`;
    const body = `<p>Hi ${interview.candidate.name},</p><p>Your interview for the role of <strong>${interview.job.title}</strong> has been rescheduled${duration ? ` with a new duration of ${duration} minutes` : ""}. Please use the link below to join:</p><p><a href="${interviewLink}">${interviewLink}</a></p><p>This link expires on ${expiresAt.toUTCString()}.</p>`;

    await dispatchInterviewEmail({
      interview,
      type: EmailType.Reschedule,
      subject,
      body,
      template: "interview_reschedule",
      templateData: { interviewLink, candidateName: interview.candidate.name, jobTitle: interview.job.title, duration: totalDuration, expiresAt: expiresAt.toISOString() },
    });

    await logAuditEvent({
      action: "interview.reschedule",
      entityType: "interview",
      entityId: id,
      actorId: user.id,
      actorEmail: user.email,
      organizationId: interview.organizationId,
      metadata: { totalDuration, expiresAt: expiresAt.toISOString() },
      ipAddress: getClientIp(request),
      userAgent: getClientUserAgent(request),
    });

    return { link: interviewLink, token: secureToken, expiresAt, totalDuration };
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

  server.post("/api/v1/interviews/candidate/join", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = joinInterviewSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "interviewToken is required" };
    }

    const interview = await db.interview.findUnique({
      where: { secureToken: parsed.data.interviewToken },
      include: { candidate: true, job: { include: { organization: true } }, questions: { orderBy: { sequence: "asc" } }, answers: true },
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
    if (interview.inviteExpiresAt && new Date(interview.inviteExpiresAt).getTime() < Date.now()) {
      reply.code(403);
      return { error: "This interview invitation has expired. Please contact the interviewer." };
    }

    const answeredIds = new Set(interview.answers.map((item) => item.questionId));
    const currentQuestion = interview.questions.find((q) => !answeredIds.has(q.id)) || null;

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
        firstName: interview.candidate.name.split(" ")[0] || "Candidate",
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

  server.post("/api/v1/interviews/candidate/:id/answer", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request: FastifyRequest, reply: FastifyReply) => {
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
    if (interview.inviteExpiresAt && new Date(interview.inviteExpiresAt).getTime() < Date.now()) {
      reply.code(403);
      return { error: "This interview invitation has expired. Please contact the interviewer." };
    }

    const question = await db.interviewQuestion.findFirst({ where: { id: data.questionId, interviewId: id } });
    if (!question) {
      reply.code(400);
      return { error: "Question not found for this interview" };
    }

    const existingAnswer = await db.interviewAnswer.findFirst({
      where: { interviewId: id, questionId: question.id },
    });
    if (existingAnswer) {
      reply.code(409);
      return { error: "This question has already been answered" };
    }

    if (antiPromptInjection(data.answer)) {
      reply.code(400);
      return { error: "Answer contains prohibited content" };
    }
    const securedAnswer = sanitizeInput(data.answer);

    const answer = await db.interviewAnswer.create({
      data: {
        interviewId: id,
        questionId: question.id,
        answer: securedAnswer,
        durationSeconds: data.durationSeconds,
        confidence: data.confidence,
      },
    });

    const totalSeconds = interview.totalDuration > 0 ? interview.totalDuration * 60 : 0;
    const newElapsed = (interview.elapsedSeconds ?? 0) + data.durationSeconds;
    const isComplete = totalSeconds > 0 && newElapsed >= totalSeconds;

    await db.interview.update({
      where: { id },
      data: {
        elapsedSeconds: { increment: data.durationSeconds },
        ...(isComplete ? { status: InterviewStatus.Completed, endedAt: new Date() } : {}),
      },
    });

    let nextQuestion = null;
    if (!isComplete && !question.isFollowUp) {
      const followUpCount = await db.interviewQuestion.count({
        where: { interviewId: id, isFollowUp: true },
      });
      if (followUpCount < MAX_FOLLOW_UP_QUESTIONS_PER_INTERVIEW) {
        try {
          const planner = new InterviewPlanner(getAIProvider());
          const topic = [interview.job.title, question.section, question.type].filter(Boolean).join(" ");
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

  server.post("/api/v1/interviews/candidate/:id/complete", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const parsed = completeInterviewSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "interviewToken is required" };
    }

    const interview = await db.interview.findUnique({ where: { secureToken: parsed.data.interviewToken } });
    if (!interview || interview.id !== id) {
      reply.code(404);
      return { error: "Interview not found" };
    }
    if (interview.status === InterviewStatus.Cancelled) {
      reply.code(403);
      return { error: "This interview has been cancelled" };
    }
    if (interview.inviteExpiresAt && new Date(interview.inviteExpiresAt).getTime() < Date.now()) {
      reply.code(403);
      return { error: "This interview invitation has expired. Please contact the interviewer." };
    }
    if (interview.status === InterviewStatus.Completed) {
      return { completed: true, interviewId: interview.id };
    }

    const updated = await db.interview.update({
      where: { id },
      data: { status: InterviewStatus.Completed, endedAt: new Date() },
    });

    return { completed: true, interviewId: updated.id, status: updated.status };
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