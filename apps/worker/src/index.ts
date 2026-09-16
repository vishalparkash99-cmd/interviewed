import { config, createLogger } from "@interviewed/config";
import { createQueueConnection } from "@interviewed/queue";
import type { QueueMessage } from "@interviewed/queue";
import { createPrismaClient } from "@interviewed/database";
import type { PrismaClient } from "@interviewed/database";
import { createAIJob, processAIJob, toDbJobType } from "./ai-jobs";
import type { AIJob } from "./ai-jobs";
import { startHealthServer, type HealthServer } from "./health";

const logger = createLogger("worker");

type JobRefs = {
  jobId?: string;
  candidateId?: string;
  interviewId?: string;
};

type Subscription = {
  queue: string;
  type: string;
  refs?: (msg: QueueMessage, payload: unknown) => JobRefs;
};

type QueueHandle = {
  publish: (queue: string, message: unknown) => Promise<string>;
  close: () => Promise<void>;
};

async function waitForQueue(queue: QueueHandle): Promise<void> {
  const maxAttempts = 10;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await queue.publish("worker.health", {
        type: "health",
        organizationId: "probe",
        payload: { probe: true },
      });
      logger.info("RabbitMQ connection established");
      return;
    } catch (err) {
      logger.warn({ attempt, maxAttempts, err }, "RabbitMQ not reachable, retrying");
      if (attempt === maxAttempts) {
        throw new Error("Failed to establish RabbitMQ connection");
      }
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
    }
  }
}

function resolvePayload(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object"
    ? (payload as Record<string, unknown>)
    : {};
}

function normalizePayload(payload: unknown): Record<string, unknown> {
  const first = resolvePayload(payload);
  const nested = first.payload;
  if (
    typeof nested === "object" &&
    nested !== null &&
    typeof first.id === "string" &&
    typeof first.attemptCount === "number"
  ) {
    return resolvePayload(nested);
  }
  return first;
}

async function runJob(db: PrismaClient, subscription: Subscription, msg: QueueMessage): Promise<AIJob> {
  const payload = normalizePayload(msg.payload);
  const refs = subscription.refs ? subscription.refs(msg, msg.payload) : {};

  // Use the API's pre-created AIProcessingJob ID when available (avoids duplicates)
  const apiJobId = typeof payload.aiJobId === "string" ? payload.aiJobId : undefined;

  const job: AIJob = createAIJob({
    type: subscription.type,
    organizationId: msg.organizationId || (typeof payload.organizationId === "string" ? payload.organizationId : ""),
    jobId: refs.jobId,
    candidateId: refs.candidateId,
    interviewId: refs.interviewId,
    payload,
  });
  if (apiJobId) {
    job.id = apiJobId;
  } else {
    job.id = msg.id || job.id;
  }

  logger.info({ jobId: job.id, type: subscription.type }, "Processing job");

  await db.aIProcessingJob.upsert({
    where: { id: job.id },
    create: {
      id: job.id,
      type: toDbJobType(job.type) as never,
      status: "queued" as never,
      organizationId: job.organizationId,
      jobId: job.jobId,
      candidateId: job.candidateId,
      payload: job.payload as object,
      retryCount: 0,
      maxRetries: 3,
    },
    update: {
      status: "processing" as never,
      startedAt: new Date(),
      error: null,
      updatedAt: new Date(),
    },
  });

  const processed = await processAIJob(job, db);
  logger.info(
    { jobId: job.id, type: subscription.type, status: processed.status },
    "Job processed"
  );
  return processed;
}

function buildSubscriptions(queues: ReturnType<typeof config.getRabbitMqQueues>): Subscription[] {
  return [
    {
      queue: queues.resumeParsing,
      type: "resume.parsing",
      refs: (msg, payload) => ({
        candidateId: msg.candidateId || resolvePayload(payload).candidateId as string | undefined,
      }),
    },
    {
      queue: queues.matching,
      type: "candidate.matching",
      refs: (msg, payload) => {
        const raw = resolvePayload(payload);
        return {
          jobId: msg.jobId || raw.jobId as string | undefined,
          candidateId: msg.candidateId || raw.candidateId as string | undefined,
        };
      },
    },
    {
      queue: queues.aiEvaluation,
      type: "ai.evaluation",
      refs: (_msg, payload) => ({ interviewId: resolvePayload(payload).interviewId as string | undefined }),
    },
    {
      queue: queues.email,
      type: "email.sending",
    },
    {
      queue: queues.report,
      type: "report.generation",
    },
  ];
}

function installShutdownHandlers(
  queue: QueueHandle,
  db: PrismaClient,
  health: HealthServer
): void {
  let shuttingDown = false;

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Shutting down worker");

    const forceExit = setTimeout(() => {
      logger.error("Graceful shutdown timed out, forcing exit");
      process.exit(1);
    }, 10000);
    forceExit.unref();

    try {
      await health.close();
      await queue.close();
      await db.$disconnect();
      logger.info("Worker shutdown complete");
      process.exit(0);
    } catch (err) {
      logger.error({ err }, "Error during shutdown");
      process.exit(1);
    }
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("unhandledRejection", (reason) => {
    logger.error({ reason }, "Unhandled promise rejection");
  });
}

async function main(): Promise<void> {
  logger.info("Worker starting...");

  const db = createPrismaClient();
  const queue = createQueueConnection(config.getRabbitMqUrl(), { prefetchCount: 2 });
  const queues = config.getRabbitMqQueues();

  const health = startHealthServer(config.getWorkerPort());

  try {
    await waitForQueue(queue);
    health.setReady(true);
  } catch (err) {
    logger.error({ err }, "Queue connection failed");
    await health.close();
    await queue.close();
    await db.$disconnect();
    throw err;
  }

  const subscriptions = buildSubscriptions(queues);
  for (const subscription of subscriptions) {
    // The resume.parsing queue uses a dedicated handler that also triggers
    // automatic candidate-job matching after a successful parse.
    if (subscription.queue === queues.resumeParsing) continue;
    await queue.subscribe(subscription.queue, async (msg) => {
      await runJob(db, subscription, msg);
    });
    logger.info({ queue: subscription.queue }, "Subscribed to queue");
  }

  // Dedicated resume.parsing handler: parse the resume, then automatically
  // publish candidate.matching jobs against all active jobs in the org.
  await queue.subscribe(queues.resumeParsing, async (msg) => {
    let processed: AIJob | undefined;
    try {
      processed = await runJob(
        db,
        {
          queue: queues.resumeParsing,
          type: "resume.parsing",
          refs: (m, payload) => ({
            candidateId: m.candidateId || (resolvePayload(payload).candidateId as string | undefined),
          }),
        },
        msg
      );
      if (processed && processed.status === "completed") {
        const payload = normalizePayload(msg.payload);
        const organizationId = msg.organizationId || (payload.organizationId as string) || "";
        const candidateId = msg.candidateId || (payload.candidateId as string);
        if (candidateId) {
          const activeJobs = await db.job.findMany({
            where: { organizationId, status: "active" as never, deletedAt: null },
            select: { id: true },
          });
          for (const job of activeJobs) {
            await queue.publish(queues.matching, {
              jobId: job.id,
              candidateId,
              organizationId,
            });
          }
        }
      }
    } catch (err) {
      logger.error({ err, jobId: msg.id }, "Resume parse handler failed");
    }
  });

  logger.info("Worker started, listening on queues");
  installShutdownHandlers(queue, db, health);
}

main().catch((err) => {
  logger.error({ err }, "Worker failed to start");
  process.exit(1);
});