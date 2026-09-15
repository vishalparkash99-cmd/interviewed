import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import { config } from "@interviewed/config";
import { createPrismaClient } from "@interviewed/database";

const db = createPrismaClient();

type AuthUser = { id: string; email: string; role: string; organizationId?: string | null };

async function attachOrgId(user: { id: string; email: string; role: string }): Promise<AuthUser> {
  try {
    const fullUser = await db.user.findUnique({
      where: { id: user.id },
      select: { organizationId: true },
    });
    return { ...user, organizationId: fullUser?.organizationId || null };
  } catch {
    return { ...user, organizationId: null };
  }
}

const authPlugin = fp(async (fastify: FastifyInstance): Promise<void> => {
  await fastify.register(cookie);

  await fastify.register(jwt, {
    secret: config.getJwtSecret(),
    cookie: { cookieName: "interviewed-token", signed: false },
  });

  fastify.decorate("verifyAuth", async (request: FastifyRequest) => {
    try {
      await (request as any).jwtVerify();
      const user = (request as any).user as { id: string; email: string; role: string };
      const withOrg = await attachOrgId(user);
      (request as any).user = withOrg;
      return withOrg;
    } catch {
      return null;
    }
  });

  fastify.decorate("requireRole", (...roles: string[]) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await (request as any).jwtVerify();
        const user = (request as any).user as { id: string; email: string; role: string };
        if (!user || !roles.includes(user.role)) {
          reply.code(403).send({ error: "Forbidden" });
          return null;
        }
        const withOrg = await attachOrgId(user);
        (request as any).user = withOrg;
        return withOrg;
      } catch {
        reply.code(401).send({ error: "Unauthorized" });
        return null;
      }
    };
  });

  fastify.decorate("requireOrg", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await (request as any).jwtVerify();
      const user = (request as any).user as { id: string; email: string; role: string };
      const withOrg = await attachOrgId(user);
      (request as any).user = withOrg;
      if (user.role === "super_admin") return null;
      if (!withOrg.organizationId) {
        reply.code(403).send({ error: "Organization required" });
        return null;
      }
      return withOrg.organizationId;
    } catch {
      reply.code(401).send({ error: "Unauthorized" });
      return null;
    }
  });
});

export { authPlugin };
