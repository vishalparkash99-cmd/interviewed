import fastify, { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import { config } from "@interviewed/config";
import { createLogger } from "@interviewed/config/logger";
import { authPlugin } from "./plugins/auth";
import { emailPlugin } from "./services/email";

const logger = createLogger("api");

export async function createApiServer(): Promise<FastifyInstance> {
  const server = fastify({
    logger: {
      level: config.getLogLevel(),
      transport: config.getLogFormat() === "json" ? undefined : { target: "pino-pretty" },
    },
    trustProxy: true,
    requestIdHeader: "x-request-id",
    genReqId: () => crypto.randomUUID(),
  });

  await server.register(cors, {
    origin: config.get("NODE_ENV") === "development" ? ["http://localhost:3000"] : false,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  });

  await server.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "ws:", "https:"],
      },
    },
  });

  await server.register(rateLimit, {
    timeWindow: config.getRateLimit().windowMs,
    max: config.getRateLimit().max,
    keyGenerator: (request: FastifyRequest) => {
      return request.raw.socket.remoteAddress?.replace(/^::ffff:/, "") || "unknown";
    },
  });

  await server.register(authPlugin);
  await server.register(emailPlugin);

  await server.register(multipart, {
    limits: {
      fileSize: config.getMaxFileSizeBytes(),
      files: 1,
    },
  });

  // Clients sometimes send JSON without a matching Content-Type header (e.g.
  // browsers default fetch string bodies to text/plain). Parse it as an object
  // instead of leaving a raw string that fails Zod's object validation; fall
  // back to the original string when the body is not valid JSON.
  server.addContentTypeParser("text/plain", { parseAs: "string" }, (_request, body, done) => {
    try {
      done(null, JSON.parse(String(body)));
    } catch {
      done(null, body);
    }
  });

  server.get("/health", async (_request: FastifyRequest, _reply: FastifyReply) => ({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    services: { database: "ready", redis: "ready", queue: "ready", storage: "ready" },
  }));

  server.setErrorHandler((error: unknown, _request, reply) => {
    const err = error as { message?: string; statusCode?: number; code?: string };
    const status = err.statusCode ?? 500;

    if (status >= 500) {
      logger.error({ err: err.message, stack: (error as Error)?.stack }, "Request error");
      reply.code(status).send({
        error: { message: "Internal server error", code: "INTERNAL_ERROR" },
      });
      return;
    }

    logger.warn({ err: err.message }, "Request error");
    reply.code(status).send({
      error: { message: err.message, code: err.code ?? "REQUEST_ERROR" },
    });
  });

  return server;
}