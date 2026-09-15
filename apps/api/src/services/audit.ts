import { createPrismaClient } from "@interviewed/database";
import { createLogger } from "@interviewed/config/logger";

const logger = createLogger("audit");
const db = createPrismaClient();

export type AuditLogParams = {
  action: string;
  entityType: string;
  entityId: string;
  actorId: string;
  actorEmail?: string;
  organizationId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
};

export async function logAuditEvent(params: AuditLogParams): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        id: crypto.randomUUID(),
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        actorId: params.actorId,
        actorEmail: params.actorEmail || null,
        organizationId: params.organizationId || null,
        metadata: (params.metadata || {}) as object,
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
      },
    });
    logger.debug({ action: params.action, entityType: params.entityType, entityId: params.entityId }, "Audit log created");
  } catch (error) {
    logger.error({ err: error, action: params.action }, "Failed to create audit log");
  }
}

export { createLogger } from "@interviewed/config/logger";
export { PrismaClient } from "@interviewed/database";
