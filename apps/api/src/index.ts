import { createApiServer } from "./server";
import { registerAllRoutes } from "./routes";
import { createPrismaClient, PrismaClient } from "@interviewed/database";
import { config } from "@interviewed/config";
import { createLogger } from "@interviewed/config/logger";

export { createApiServer } from "./server";
export { createPrismaClient, PrismaClient } from "@interviewed/database";
export { registerAllRoutes } from "./routes";

const logger = createLogger("api-main");

async function startServer(): Promise<void> {
  const server = await createApiServer();
  await registerAllRoutes(server);
  const port = config.getApiPort();
  await server.listen({ port, host: "0.0.0.0" });
  logger.info(`API server listening on http://localhost:${port}`);
}

if (typeof require !== "undefined" && require.main === module) {
  startServer().catch((err: unknown) => {
    const error = err as { message?: string };
    logger.error({ err: error?.message }, "Failed to start API server");
    process.exit(1);
  });
}