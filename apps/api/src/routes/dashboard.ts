import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createPrismaClient } from "@interviewed/database";
import { UserRole, CandidateStatus, MatchStatus, InterviewStatus, JobStatus } from "@interviewed/types";
import { getUser, isSuperAdmin } from "./utils";

const db = createPrismaClient();

function orgClause(user: { role: string; organizationId?: string | null }): { organizationId: string } | Record<string, never> {
  if (isSuperAdmin(user)) return {};
  return { organizationId: user.organizationId ?? "" };
}

function matchScope(user: { role: string; organizationId?: string | null }): { job: { organizationId: string } } | Record<string, never> {
  if (isSuperAdmin(user)) return {};
  return { job: { organizationId: user.organizationId ?? "" } };
}

const PIPELINE_STAGES = [
  CandidateStatus.Active,
  CandidateStatus.Screened,
  CandidateStatus.Shortlisted,
  CandidateStatus.Hired,
  CandidateStatus.Rejected,
  CandidateStatus.Archived,
] as const;

export async function registerDashboardRoutes(server: FastifyInstance): Promise<void> {
  server.get("/api/v1/dashboard/summary", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(request);
    if (!isSuperAdmin(user) && !user.organizationId) {
      reply.code(403);
      return { error: "Organization required" };
    }

    const scope = orgClause(user);

    const [
      totalJobs,
      activeJobs,
      closedJobs,
      draftJobs,
      totalCandidates,
      screened,
      shortlisted,
      hired,
      rejected,
      archived,
      interviewsScheduled,
      interviewsInProgress,
      interviewsCompleted,
      interviewsCancelled,
      pendingMatches,
      approvedMatches,
      rejectedMatches,
      totalEmailsSent,
    ] = await Promise.all([
      db.job.count({ where: { deletedAt: null, ...scope } }),
      db.job.count({ where: { deletedAt: null, status: JobStatus.Active, ...scope } }),
      db.job.count({ where: { deletedAt: null, status: JobStatus.Closed, ...scope } }),
      db.job.count({ where: { deletedAt: null, status: JobStatus.Draft, ...scope } }),
      db.candidate.count({ where: { deletedAt: null, ...scope } }),
      db.candidate.count({ where: { deletedAt: null, status: CandidateStatus.Screened, ...scope } }),
      db.candidate.count({ where: { deletedAt: null, status: CandidateStatus.Shortlisted, ...scope } }),
      db.candidate.count({ where: { deletedAt: null, status: CandidateStatus.Hired, ...scope } }),
      db.candidate.count({ where: { deletedAt: null, status: CandidateStatus.Rejected, ...scope } }),
      db.candidate.count({ where: { deletedAt: null, status: CandidateStatus.Archived, ...scope } }),
      db.interview.count({ where: { status: InterviewStatus.Scheduled, ...scope } }),
      db.interview.count({ where: { status: InterviewStatus.InProgress, ...scope } }),
      db.interview.count({ where: { status: InterviewStatus.Completed, ...scope } }),
      db.interview.count({ where: { status: InterviewStatus.Cancelled, ...scope } }),
      db.candidateJobMatch.count({ where: { status: MatchStatus.Pending, ...matchScope(user) } }),
      db.candidateJobMatch.count({ where: { status: MatchStatus.Approved, ...matchScope(user) } }),
      db.candidateJobMatch.count({ where: { status: MatchStatus.Rejected, ...matchScope(user) } }),
      db.email.count({ where: { status: "sent", ...scope } }),
    ]);

    return {
      jobs: { total: totalJobs, active: activeJobs, closed: closedJobs, draft: draftJobs },
      candidates: {
        total: totalCandidates,
        screened,
        shortlisted,
        hired,
        rejected,
        archived,
        active: totalCandidates - screened - shortlisted - hired - rejected - archived,
      },
      interviews: {
        scheduled: interviewsScheduled,
        inProgress: interviewsInProgress,
        completed: interviewsCompleted,
        cancelled: interviewsCancelled,
        total: interviewsScheduled + interviewsInProgress + interviewsCompleted + interviewsCancelled,
      },
      matches: { pending: pendingMatches, approved: approvedMatches, rejected: rejectedMatches },
      emailsSent: totalEmailsSent,
    };
  });

  server.get("/api/v1/dashboard/jobs/:jobId/stats", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)] }, async (request: FastifyRequest, reply: FastifyReply) => {
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

    const [candidateMatches, interviews, matches, avgResult, interviewsByStatus] = await Promise.all([
      db.candidateJobMatch.findMany({ where: { jobId }, select: { candidateId: true } }),
      db.interview.count({ where: { jobId } }),
      db.candidateJobMatch.count({ where: { jobId } }),
      db.candidateJobMatch.aggregate({ where: { jobId }, _avg: { overallScore: true } }),
      db.interview.groupBy({ by: ["status"], where: { jobId }, _count: { _all: true } }),
    ]);

    const totalCandidates = candidateMatches.length;
    const averageMatchScore = avgResult._avg.overallScore ?? 0;

    const interviewsByStatusMap = {
      scheduled: 0,
      in_progress: 0,
      completed: 0,
      cancelled: 0,
    } as Record<string, number>;
    for (const row of interviewsByStatus) {
      interviewsByStatusMap[row.status] = row._count._all;
    }

    return {
      jobId,
      job: { id: job.id, title: job.title, status: job.status, createdAt: job.createdAt },
      totalCandidates,
      totalInterviews: interviews,
      totalMatches: matches,
      averageMatchScore: Math.round(averageMatchScore * 100) / 100,
      interviewsByStatus: interviewsByStatusMap,
    };
  });

  server.get("/api/v1/dashboard/pipeline/:jobId", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)] }, async (request: FastifyRequest, reply: FastifyReply) => {
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
      select: { candidateId: true, status: true, overallScore: true },
    });

    const candidateIds = [...new Set(matches.map((m) => m.candidateId))];
    const statusGroups = candidateIds.length > 0
      ? await db.candidate.groupBy({ by: ["status"], where: { id: { in: candidateIds }, deletedAt: null }, _count: { _all: true } })
      : [];

    const stageCounts = new Map<string, number>();
    for (const stage of PIPELINE_STAGES) stageCounts.set(stage, 0);
    for (const group of statusGroups) {
      stageCounts.set(group.status, group._count._all);
    }

    const matchStatusCounts = {
      pending: 0,
      approved: 0,
      rejected: 0,
    } as Record<string, number>;
    for (const m of matches) {
      matchStatusCounts[m.status] = (matchStatusCounts[m.status] ?? 0) + 1;
    }

    return {
      jobId,
      pipeline: PIPELINE_STAGES.map((stage) => ({ stage, count: stageCounts.get(stage) ?? 0 })),
      matchDecisions: matchStatusCounts,
      averageMatchScore: matches.length > 0 ? Math.round((matches.reduce((s, m) => s + m.overallScore, 0) / matches.length) * 100) / 100 : 0,
    };
  });
}