import type { FastifyReply, FastifyRequest } from "fastify";
import { UserRole } from "@interviewed/types";

export type AuthedUser = {
  id: string;
  email: string;
  role: string;
  organizationId?: string | null;
};

export function getUser(request: FastifyRequest): AuthedUser {
  return (request as any).user as AuthedUser;
}

export function isSuperAdmin(user: { role: string }): boolean {
  return user.role === UserRole.SuperAdmin;
}

export function getClientIp(request: FastifyRequest): string | undefined {
  const forwarded = (request.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim();
  return forwarded || request.ip;
}

export function getClientUserAgent(request: FastifyRequest): string | undefined {
  return (request.headers["user-agent"] as string | undefined) || undefined;
}

export function getPagination(query: Record<string, unknown>): { page: number; limit: number; skip: number; take: number } {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  return { page, limit, skip: (page - 1) * limit, take: limit };
}

export function paginate<T>(data: T[], total: number, page: number, limit: number) {
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  };
}

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "resource"
  );
}

export function sanitizeFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() || "file";
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 128);
}

export function requireOrganization(user: AuthedUser, reply: FastifyReply): string | null {
  if (isSuperAdmin(user)) return null;
  if (!user.organizationId) {
    reply.code(403).send({ error: "Organization required" });
    return null;
  }
  return user.organizationId;
}