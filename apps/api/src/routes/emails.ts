import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createPrismaClient } from "@interviewed/database";
import { UserRole, EmailType, EmailStatus } from "@interviewed/types";
import { createEmailSchema } from "../validation";
import { logAuditEvent } from "../services/audit";
import { getUser, isSuperAdmin, getPagination, paginate, getClientIp, getClientUserAgent } from "./utils";

const db = createPrismaClient();

function orgClause(user: { role: string; organizationId?: string | null }): { organizationId: string } | Record<string, never> {
  if (isSuperAdmin(user)) return {};
  return { organizationId: user.organizationId ?? "" };
}

export async function registerEmailRoutes(server: FastifyInstance): Promise<void> {
  server.get("/api/v1/emails", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(request);
    if (!isSuperAdmin(user) && !user.organizationId) {
      reply.code(403);
      return { error: "Organization required" };
    }

    const query = request.query as Record<string, unknown>;
    const { page, limit, skip, take } = getPagination(query);

    const type = typeof query.type === "string" && query.type.length > 0 ? query.type : undefined;
    const status = typeof query.status === "string" && query.status.length > 0 ? query.status : undefined;

    const where = {
      ...orgClause(user),
      ...(type ? { type: type as EmailType } : {}),
      ...(status ? { status: status as EmailStatus } : {}),
    };

    const [emails, total] = await Promise.all([
      db.email.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      db.email.count({ where }),
    ]);

    return paginate(emails, total, page, limit);
  });

  server.post("/api/v1/emails", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(request);
    if (!isSuperAdmin(user) && !user.organizationId) {
      reply.code(403);
      return { error: "Organization required" };
    }

    const parsed = createEmailSchema.safeParse(request.body);
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

    if (data.jobId) {
      const job = await db.job.findFirst({ where: { id: data.jobId, deletedAt: null, organizationId } });
      if (!job) {
        reply.code(400);
        return { error: "Job not found in this organization" };
      }
    }
    if (data.candidateId) {
      const candidate = await db.candidate.findFirst({ where: { id: data.candidateId, deletedAt: null, organizationId } });
      if (!candidate) {
        reply.code(400);
        return { error: "Candidate not found in this organization" };
      }
    }
    if (data.interviewId) {
      const interview = await db.interview.findFirst({ where: { id: data.interviewId, organizationId } });
      if (!interview) {
        reply.code(400);
        return { error: "Interview not found in this organization" };
      }
    }

    const email = await db.email.create({
      data: {
        type: data.type,
        recipient: data.recipient,
        recipientName: data.recipientName ?? null,
        subject: data.subject,
        body: data.body,
        template: data.template ?? null,
        templateData: (data.templateData ?? {}) as object,
        status: EmailStatus.Pending,
        jobId: data.jobId ?? null,
        candidateId: data.candidateId ?? null,
        interviewId: data.interviewId ?? null,
        organizationId,
      },
    });

    await logAuditEvent({
      action: "email.create",
      entityType: "email",
      entityId: email.id,
      actorId: user.id,
      actorEmail: user.email,
      organizationId,
      metadata: { type: email.type, recipient: email.recipient },
      ipAddress: getClientIp(request),
      userAgent: getClientUserAgent(request),
    });

    reply.code(201);
    return email;
  });

  server.get("/api/v1/emails/:id", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const user = getUser(request);
    if (!isSuperAdmin(user) && !user.organizationId) {
      reply.code(403);
      return { error: "Organization required" };
    }

    const email = await db.email.findFirst({ where: { id, ...orgClause(user) } });
    if (!email) {
      reply.code(404);
      return { error: "Email not found" };
    }
    return email;
  });
}