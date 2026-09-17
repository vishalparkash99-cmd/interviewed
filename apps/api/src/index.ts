import { createApiServer } from "./server";
import { registerAllRoutes } from "./routes";
import { createPrismaClient, PrismaClient } from "@interviewed/database";
import { config } from "@interviewed/config";
import { createLogger } from "@interviewed/config/logger";
import { startWorker, type WorkerHandle } from "@interviewed/worker";

export { createApiServer } from "./server";
export { createPrismaClient, PrismaClient } from "@interviewed/database";
export { registerAllRoutes } from "./routes";

const logger = createLogger("api-main");

async function startServer(): Promise<void> {
  const server = await createApiServer();
  await registerAllRoutes(server);

  let worker: WorkerHandle | undefined;

  // Ensure embedded queue workers shut down cleanly when the HTTP server closes.
  server.addHook("onClose", async () => {
    if (!worker) return;
    logger.info("Shutting down queue workers");
    try {
      await worker.close();
      logger.info("Queue workers stopped");
    } catch (err) {
      const error = err as { message?: string };
      logger.error({ err: error?.message }, "Error while shutting down queue workers");
    } finally {
      worker = undefined;
    }
  });

  const port = config.getApiPort();
  await server.listen({ port, host: "0.0.0.0" });
  logger.info(`API server listening on http://localhost:${port}`);

  // Initialize queue workers inside the API process so a single deployment can
  // serve HTTP and consume background jobs. Failures are non-fatal: the HTTP
  // server keeps running, and the error is logged for observability.
  try {
    worker = await startWorker();
    logger.info("Queue workers initialized successfully in API process");
  } catch (err) {
    const error = err as { message?: string };
    logger.error(
      { err: error?.message },
      "Failed to initialize queue workers; continuing without workers"
    );
  }

  // Fastify does not handle termination signals itself; wire them up so the
  // queue consumers (and the HTTP server) shut down gracefully.
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "Shutting down API server");
    try {
      await server.close();
      process.exit(0);
    } catch (err) {
      const error = err as { message?: string };
      logger.error({ err: error?.message }, "Error during shutdown");
      process.exit(1);
    }
  };

  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
}

if (typeof require !== "undefined" && require.main === module) {
  startServer().catch((err: unknown) => {
    const error = err as { message?: string };
    logger.error({ err: error?.message }, "Failed to start API server");
    process.exit(1);
  });
}