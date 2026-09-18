import { createPrismaClient } from "@interviewed/database";
import { EmailStatus, EmailType } from "@interviewed/types";
import { config, createLogger } from "@interviewed/config";
import { createQueueConnection } from "@interviewed/queue";

const db = createPrismaClient();
const logger = createLogger("email-dispatch");

type DispatchEmailInput = {
  type: EmailType;
  recipient: string;
  recipientName?: string | null;
  subject: string;
  body: string;
  template?: string;
  templateData?: Record<string, unknown>;
  jobId?: string | null;
  candidateId?: string | null;
  interviewId?: string | null;
  organizationId: string;
};

/**
 * Publishes an email record to the `email.sending` queue so the worker can
 * deliver it via SMTP (or a mock provider in local dev). Never throws - returns
 * false when the queue is unreachable so the record can be retried later.
 */
export async function publishEmailNow(
  emailId: string,
  recipient: string,
  subject: string,
  body: string,
  organizationId?: string | null
): Promise<boolean> {
  try {
    const queue = createQueueConnection(config.getRabbitMqUrl());
    const queues = config.getRabbitMqQueues();
    await queue.publish(queues.email, {
      emailId,
      to: recipient,
      subject,
      body,
      organizationId: organizationId ?? null,
    });
    await queue.close();
    return true;
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err), emailId },
      "Failed to enqueue email; record left pending"
    );
    return false;
  }
}

/**
 * Persists an email record and enqueues it on the `email.sending` queue. The
 * record doubles as an audit trail: status moves pending -> sent/failed.
 */
export async function enqueueEmail(data: DispatchEmailInput): Promise<{ emailId: string }> {
  const email = await db.email.create({
    data: {
      type: data.type,
      recipient: data.recipient,
      recipientName: data.recipientName ?? null,
      subject: data.subject,
      body: data.body,
      template: data.template ?? null,
      templateData: (data.templateData ?? {}) as object,
      status: EmailStatus.Pending,
      jobId: data.jobId ?? null,
      candidateId: data.candidateId ?? null,
      interviewId: data.interviewId ?? null,
      organizationId: data.organizationId,
    },
  });

  await publishEmailNow(email.id, data.recipient, data.subject, data.body, data.organizationId);

  return { emailId: email.id };
}