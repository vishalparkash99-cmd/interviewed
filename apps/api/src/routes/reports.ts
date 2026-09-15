import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { createPrismaClient } from "@interviewed/database";
import { UserRole } from "@interviewed/types";
import { logAuditEvent } from "../services/audit";
import { getUser, isSuperAdmin, getPagination, paginate, getClientIp, getClientUserAgent } from "./utils";

const db = createPrismaClient();

const reportDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected", "review"]),
  note: z.string().max(2000).optional(),
  hire: z.boolean().optional(),
});

export async function registerReportRoutes(server: FastifyInstance): Promise<void> {
  server.get("/api/v1/reports", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(request);
    if (!isSuperAdmin(user) && !user.organizationId) {
      reply.code(403);
      return { error: "Organization required" };
    }

    const query = request.query as Record<string, unknown>;
    const { page, limit, skip, take } = getPagination(query);
    const jobId = typeof query.jobId === "string" && query.jobId.length > 0 ? query.jobId : undefined;

    const where = {
      ...(jobId ? { interview: { jobId } } : {}),
      interview: { organizationId: isSuperAdmin(user) ? undefined : user.organizationId ?? "" },
    };

    const [reports, total] = await Promise.all([
      db.interviewReport.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          interview: {
            select: {
              id: true,
              status: true,
              organizationId: true,
              candidate: { select: { id: true, name: true, email: true } },
              job: { select: { id: true, title: true, slug: true } },
            },
          },
        },
      }),
      db.interviewReport.count({ where }),
    ]);

    return paginate(reports, total, page, limit);
  });

  server.get("/api/v1/reports/:id", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const user = getUser(request);
    if (!isSuperAdmin(user) && !user.organizationId) {
      reply.code(403);
      return { error: "Organization required" };
    }

    const report = await db.interviewReport.findFirst({
      where: { id, interview: { organizationId: isSuperAdmin(user) ? undefined : user.organizationId ?? "" } },
      include: {
        interview: {
          include: {
            candidate: { include: { resume: true } },
            job: true,
            evaluation: true,
          },
        },
      },
    });
    if (!report) {
      reply.code(404);
      return { error: "Report not found" };
    }
    return report;
  });

  server.post("/api/v1/reports/:id/decision", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const user = getUser(request);

    const parsed = reportDecisionSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "Invalid input", details: parsed.error.flatten() };
    }
    const { decision, note, hire } = parsed.data;

    const report = await db.interviewReport.findFirst({
      where: { id, interview: { organizationId: isSuperAdmin(user) ? undefined : user.organizationId ?? "" } },
      include: { interview: true },
    });
    if (!report) {
      reply.code(404);
      return { error: "Report not found" };
    }

    const updated = await db.interviewReport.update({
      where: { id },
      data: {
        status: decision,
        hrDecision: {
          decision,
          note: note ?? null,
          hire: hire ?? false,
          by: user.id,
          at: new Date().toISOString(),
        } as object,
      },
    });

    await logAuditEvent({
      action: `report.decision.${decision}`,
      entityType: "interview_report",
      entityId: id,
      actorId: user.id,
      actorEmail: user.email,
      organizationId: report.interview.organizationId,
      metadata: { decision, note, hire },
      ipAddress: getClientIp(request),
      userAgent: getClientUserAgent(request),
    });

    return updated;
  });
}