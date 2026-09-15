import type { FastifyInstance } from "fastify";

export async function registerHealthHandlers(server: FastifyInstance): Promise<void> {
  server.get("/health", async () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  }));
}
