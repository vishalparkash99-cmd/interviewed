import { PrismaClient } from "./generated/prisma";
import { config } from "@interviewed/config";
import { createLogger } from "@interviewed/config/logger";

const logger = createLogger("database");

let client: PrismaClient | null = null;

export function createPrismaClient(): PrismaClient {
  if (!client) {
    client = new PrismaClient({
      log: config.getNodeEnv() === "development" ? ["query", "info", "warn", "error"] : ["error"],
    });
    logger.info("Prisma client created");
  }
  return client;
}

export { PrismaClient };

export type PrismaTypes = typeof import("./generated/prisma");