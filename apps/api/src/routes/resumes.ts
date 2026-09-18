import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import crypto from "crypto";
import { createPrismaClient } from "@interviewed/database";
import { UserRole, CandidateStatus } from "@interviewed/types";
import { createStorageAdapter } from "@interviewed/storage";
import { createQueueConnection } from "@interviewed/queue";
import { config } from "@interviewed/config";
import { logAuditEvent } from "../services/audit";
import { getUser, isSuperAdmin, getPagination, paginate, sanitizeFilename, getClientIp, getClientUserAgent } from "./utils";

const db = createPrismaClient();

function orgClause(user: { role: string; organizationId?: string | null }): { organizationId: string } | Record<string, never> {
  if (isSuperAdmin(user)) return {};
  return { organizationId: user.organizationId ?? "" };
}

function getMultipartField(fields: Record<string, any>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = fields?.[key];
    if (value && typeof value.value === "string" && value.value.trim().length > 0) {
      return value.value.trim();
    }
  }
  return undefined;
}

function getFileNameWithoutExtension(name: string): string {
  return name.replace(/\.[^/.]+$/, "").trim();
}

function isLocalStorage(): boolean {
  return process.env.STORAGE_PROVIDER !== "s3";
}

function resumeFileUrl(request: FastifyRequest, resumeId: string): string {
  const apiUrl = process.env.API_URL;
  if (apiUrl) return `${apiUrl.replace(/\/$/, "")}/api/v1/resumes/${resumeId}/file`;
  return `${request.protocol}://${request.host}/api/v1/resumes/${resumeId}/file`;
}

async function resolveSignedUrl(request: FastifyRequest, resume: { id: string; filePath: string }): Promise<string> {
  const storage = createStorageAdapter();
  if (isLocalStorage()) return resumeFileUrl(request, resume.id);
  return storage.getSignedUrl(resume.filePath);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function registerResumeRoutes(server: FastifyInstance): Promise<void> {
  server.post("/api/v1/resumes/upload", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(request);

    const uploaded = await request.file();
    if (!uploaded) {
      reply.code(400);
      return { error: "No file uploaded" };
    }

    let organizationId: string | undefined;
    if (isSuperAdmin(user)) {
      const candidateOrgId =
        getMultipartField(uploaded.fields, "organizationId") ??
        ((request.query as Record<string, unknown>)?.organizationId as string | undefined);
      if (candidateOrgId) {
        if (!UUID_RE.test(candidateOrgId)) {
          reply.code(400);
          return { error: "Invalid organizationId" };
        }
        const org = await db.organization.findUnique({ where: { id: candidateOrgId }, select: { id: true } });
        organizationId = org?.id ?? undefined;
      }
    } else {
      organizationId = user.organizationId ?? undefined;
    }

    if (!organizationId) {
      reply.code(403);
      return { error: "Organization required" };
    }

    const allowedTypes = config.getAllowedFileTypes();
    if (!allowedTypes.includes(uploaded.mimetype)) {
      reply.code(400);
      return { error: `Unsupported file type: ${uploaded.mimetype}. Allowed: ${allowedTypes.join(", ")}` };
    }

    const maxBytes = config.getMaxFileSizeBytes();
    if (uploaded.file.bytesRead > maxBytes) {
      reply.code(413);
      return { error: `File exceeds the ${config.get("MAX_FILE_SIZE_MB")}MB size limit` };
    }

    const buffer = await uploaded.toBuffer();
    if (buffer.length === 0) {
      reply.code(400);
      return { error: "Uploaded file is empty" };
    }
    if (buffer.length > maxBytes) {
      reply.code(413);
      return { error: `File exceeds the ${config.get("MAX_FILE_SIZE_MB")}MB size limit` };
    }

    const safeFileName = sanitizeFilename(uploaded.filename || "resume.pdf");
    const storagePath = `resumes/${organizationId}/${crypto.randomUUID()}-${safeFileName}`;

    const storage = createStorageAdapter();
    await storage.upload(storagePath, buffer, uploaded.mimetype);

    const candidateName = getMultipartField(uploaded.fields, "name", "candidateName") ?? (getFileNameWithoutExtension(safeFileName) || "Candidate");

    const resume = await db.resume.create({
      data: {
        fileName: safeFileName,
        fileMimeType: uploaded.mimetype,
        fileSize: buffer.length,
        filePath: storagePath,
        status: "pending",
        virusScanStatus: "pending",
        organizationId,
        uploadedBy: user.id,
      },
    });

    const candidate = await db.candidate.create({
      data: {
        name: candidateName,
        email: getMultipartField(uploaded.fields, "email", "candidateEmail") ?? `candidate-${crypto.randomUUID()}@candidate.local`,
        phone: getMultipartField(uploaded.fields, "phone"),
        location: getMultipartField(uploaded.fields, "location"),
        resumeId: resume.id,
        status: CandidateStatus.Active,
        organizationId,
        createdById: user.id,
      },
    });

    const aiJob = await db.aIProcessingJob.create({
      data: {
        type: "resume_parsing",
        status: "queued",
        organizationId,
        candidateId: candidate.id,
        payload: {
          resumeId: resume.id,
          candidateId: candidate.id,
          fileName: safeFileName,
          filePath: storagePath,
          fileMimeType: uploaded.mimetype,
        },
      },
    });

    const queues = config.getRabbitMqQueues();
    const queue = createQueueConnection(config.getRabbitMqUrl());
    await queue.publish(queues.resumeParsing, {
      aiJobId: aiJob.id,
      resumeId: resume.id,
      candidateId: candidate.id,
      organizationId,
      fileName: safeFileName,
      fileMimeType: uploaded.mimetype,
      filePath: storagePath,
      resumeText: uploaded.mimetype.startsWith("text/") ? buffer.toString("utf-8").slice(0, 8000) : "",
    });
    await queue.close();

    await db.resume.update({ where: { id: resume.id }, data: { status: "queued" } });

    await logAuditEvent({
      action: "resume.upload",
      entityType: "resume",
      entityId: resume.id,
      actorId: user.id,
      actorEmail: user.email,
      organizationId,
      metadata: { fileName: safeFileName, fileSize: buffer.length, candidateId: candidate.id },
      ipAddress: getClientIp(request),
      userAgent: getClientUserAgent(request),
    });

    reply.code(201);
    return {
      candidate: {
        id: candidate.id,
        name: candidate.name,
        email: candidate.email,
        status: candidate.status,
      },
      resume: {
        id: resume.id,
        fileName: resume.fileName,
        fileMimeType: resume.fileMimeType,
        fileSize: resume.fileSize,
        filePath: resume.filePath,
        status: resume.status,
      },
      signedUrl: await storage.getSignedUrl(storagePath),
    };
  });

  server.get("/api/v1/resumes", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)] }, async (request: FastifyRequest, reply: FastifyReply) => {
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
      ...(status ? { status } : {}),
    };

    const [resumes, total] = await Promise.all([
      db.resume.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: { candidate: { select: { id: true, name: true, email: true, status: true } } },
      }),
      db.resume.count({ where }),
    ]);

    return paginate(resumes, total, page, limit);
  });

  server.get("/api/v1/resumes/:id", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const user = getUser(request);
    if (!isSuperAdmin(user) && !user.organizationId) {
      reply.code(403);
      return { error: "Organization required" };
    }

    const resume = await db.resume.findFirst({
      where: { id, deletedAt: null, ...orgClause(user) },
      include: { candidate: true },
    });
    if (!resume) {
      reply.code(404);
      return { error: "Resume not found" };
    }

    return {
      ...resume,
      signedUrl: await resolveSignedUrl(request, { id: resume.id, filePath: resume.filePath }),
    };
  });

  server.get("/api/v1/resumes/:id/file", { onRequest: [(server as any).requireRole(UserRole.OrgAdmin, UserRole.Recruiter)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const user = getUser(request);
    if (!isSuperAdmin(user) && !user.organizationId) {
      reply.code(403);
      return { error: "Organization required" };
    }

    const resume = await db.resume.findFirst({
      where: { id, deletedAt: null, ...orgClause(user) },
    });
    if (!resume) {
      reply.code(404);
      return { error: "Resume not found" };
    }

    const storage = createStorageAdapter();
    const buffer = await storage.download(resume.filePath);
    reply.header("Content-Type", "application/octet-stream");
    reply.header("Content-Disposition", `attachment; filename="${resume.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}"`);
    reply.header("Content-Length", String(buffer.length));
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Cache-Control", "private, no-store");
    return reply.send(buffer);
  });
}