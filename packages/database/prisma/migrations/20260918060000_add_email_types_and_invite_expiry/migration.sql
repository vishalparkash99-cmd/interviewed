-- Extend the EmailType enum with lifecycle email types.
ALTER TYPE "EmailType" ADD VALUE IF NOT EXISTS 'reschedule';
ALTER TYPE "EmailType" ADD VALUE IF NOT EXISTS 'cancellation';
ALTER TYPE "EmailType" ADD VALUE IF NOT EXISTS 'completion';

-- Track when an interview invitation link expires so it can be enforced server-side.
ALTER TABLE "interviews" ADD COLUMN "inviteExpiresAt" TIMESTAMP(3);