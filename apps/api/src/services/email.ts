import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { createPrismaClient } from "@interviewed/database";
import { config } from "@interviewed/config";
import { createLogger } from "@interviewed/config/logger";
import { EmailType, EmailStatus } from "@interviewed/types";

const logger = createLogger("email-service");
const db = createPrismaClient();

export type EmailData = {
  to: string;
  subject: string;
  body: string;
  template?: string;
  templateData?: Record<string, unknown>;
  type?: EmailType;
  organizationId?: string | null;
  recipientName?: string | null;
  jobId?: string | null;
  candidateId?: string | null;
  interviewId?: string | null;
};

async function sendViaSmptp(emailConfig: ReturnType<typeof config.getEmailConfig>, data: EmailData): Promise<void> {
  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host: emailConfig.smtpHost,
    port: emailConfig.smtpPort,
    secure: emailConfig.smtpPort === 465,
    auth:
      emailConfig.smtpUser && emailConfig.smtpPassword
        ? { user: emailConfig.smtpUser, pass: emailConfig.smtpPassword }
        : undefined,
  });

  await transporter.sendMail({
    from: `${emailConfig.fromName} <${emailConfig.fromEmail}>`,
    to: data.to,
    subject: data.subject,
    html: data.body,
    text: data.body.replace(/<[^>]+>/g, "\n"),
  });
}

const emailPlugin = fp(async (server: FastifyInstance): Promise<void> => {
  server.decorate("sendEmail", async (data: EmailData): Promise<{ success: boolean; error?: string }> => {
    const emailConfig = config.getEmailConfig();
    logger.info({ to: data.to, subject: data.subject, provider: emailConfig.provider }, "Sending email");

    let success = true;
    let error: string | undefined;

    try {
      switch (emailConfig.provider) {
        case "mock":
          logger.info({ to: data.to, body: data.body }, "Email dispatched (mock mode)");
          break;

        case "resend":
          if (!emailConfig.resendApiKey) {
            logger.warn("Resend API key not configured, falling back to mock");
          } else {
            const response = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${emailConfig.resendApiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: `${emailConfig.fromName} <${emailConfig.fromEmail}>`,
                to: [data.to],
                subject: data.subject,
                html: data.body,
              }),
            });
            if (!response.ok) {
              const errorText = await response.text();
              logger.error({ status: response.status, error: errorText }, "Resend API error");
              throw new Error(`Resend API error: ${response.status}`);
            }
          }
          break;

        case "smtp":
          if (!emailConfig.smtpHost) {
            logger.warn("SMTP host not configured, falling back to mock");
          } else {
            await sendViaSmptp(emailConfig, data);
            logger.info({ to: data.to, host: emailConfig.smtpHost }, "Email sent via SMTP");
          }
          break;

        default:
          logger.warn({ provider: emailConfig.provider }, "Unknown email provider, falling back to mock");
          break;
      }
    } catch (sendErr) {
      const message = sendErr instanceof Error ? sendErr.message : String(sendErr);
      logger.error({ err: message, provider: emailConfig.provider }, "Failed to send email");
      success = false;
      error = message;
    }

    if (data.organizationId) {
      try {
        await db.email.create({
          data: {
            id: crypto.randomUUID(),
            type: data.type ?? EmailType.Welcome,
            recipient: data.to,
            recipientName: data.recipientName ?? null,
            subject: data.subject,
            body: data.body,
            template: data.template ?? null,
            templateData: (data.templateData ?? {}) as object,
            status: success ? EmailStatus.Sent : EmailStatus.Failed,
            organizationId: data.organizationId,
            jobId: data.jobId ?? null,
            candidateId: data.candidateId ?? null,
            interviewId: data.interviewId ?? null,
            errorCode: success ? null : "sending_failed",
            errorMessage: error ?? null,
            sentAt: success ? new Date() : null,
          },
        });
      } catch (persistErr) {
        const message = persistErr instanceof Error ? persistErr.message : String(persistErr);
        logger.error({ err: message }, "Failed to persist email record");
      }
    } else {
      logger.info({ to: data.to }, "Email not persisted (no organization context)");
    }

    return { success, error };
  });
});

export { emailPlugin };

export async function registerEmailHandlers(server: FastifyInstance): Promise<void> {
  await server.register(emailPlugin);
}