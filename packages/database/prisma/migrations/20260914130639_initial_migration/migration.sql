-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('super_admin', 'org_admin', 'recruiter', 'candidate');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('draft', 'active', 'closed', 'paused');

-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('active', 'screened', 'shortlisted', 'rejected', 'hired', 'archived');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "EmailType" AS ENUM ('invitation', 'reminder', 'result', 'welcome', 'password_reset');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('pending', 'sent', 'failed');

-- CreateEnum
CREATE TYPE "AIJobType" AS ENUM ('resume_parsing', 'candidate_matching', 'ai_evaluation', 'email_sending', 'report_generation');

-- CreateEnum
CREATE TYPE "AIJobStatus" AS ENUM ('queued', 'processing', 'completed', 'failed');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "industry" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "avatarUrl" TEXT,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "orgId" TEXT,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "department" TEXT,
    "location" TEXT,
    "employmentType" TEXT NOT NULL DEFAULT 'fulltime',
    "experienceMinYears" INTEGER NOT NULL DEFAULT 0,
    "experienceMaxYears" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "rolesResponsibilities" JSONB NOT NULL DEFAULT '[]',
    "requiredSkills" JSONB NOT NULL DEFAULT '[]',
    "preferredSkills" JSONB NOT NULL DEFAULT '[]',
    "requiredQualifications" JSONB NOT NULL DEFAULT '[]',
    "preferredQualifications" JSONB NOT NULL DEFAULT '[]',
    "domain" TEXT,
    "customScreeningCriteria" JSONB NOT NULL DEFAULT '{}',
    "interviewDuration" INTEGER NOT NULL DEFAULT 45,
    "interviewDifficulty" TEXT NOT NULL DEFAULT 'medium',
    "shortlistCount" INTEGER NOT NULL DEFAULT 10,
    "minimumScreeningScore" DOUBLE PRECISION NOT NULL DEFAULT 60,
    "scoringWeights" JSONB NOT NULL DEFAULT '{"technical":30,"experience":25,"responsibilities":25,"qualification":10,"domain":10}',
    "interviewConfig" JSONB NOT NULL DEFAULT '{}',
    "status" "JobStatus" NOT NULL DEFAULT 'draft',
    "organizationId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidates" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "location" TEXT,
    "yearsOfExperience" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "resumeId" TEXT,
    "currentJobTitle" TEXT,
    "currentCompany" TEXT,
    "linkedinUrl" TEXT,
    "portfolioUrl" TEXT,
    "normalizedData" JSONB NOT NULL DEFAULT '{}',
    "status" "CandidateStatus" NOT NULL DEFAULT 'active',
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resumes" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileMimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "filePath" TEXT NOT NULL,
    "extractedText" TEXT,
    "parsedData" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "virusScanResult" TEXT,
    "virusScanStatus" TEXT NOT NULL DEFAULT 'pending',
    "organizationId" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "resumes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_job_matches" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "skillScore" DOUBLE PRECISION NOT NULL,
    "experienceScore" DOUBLE PRECISION NOT NULL,
    "responsibilityScore" DOUBLE PRECISION NOT NULL,
    "qualificationScore" DOUBLE PRECISION NOT NULL,
    "domainScore" DOUBLE PRECISION NOT NULL,
    "strengths" JSONB NOT NULL DEFAULT '[]',
    "gaps" JSONB NOT NULL DEFAULT '[]',
    "missingRequirements" JSONB NOT NULL DEFAULT '[]',
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "recommendation" TEXT NOT NULL,
    "aiDecision" JSONB NOT NULL DEFAULT '{}',
    "hrDecision" JSONB NOT NULL DEFAULT '{}',
    "hrDecisionBy" TEXT,
    "hrDecisionAt" TIMESTAMP(3),
    "status" "MatchStatus" NOT NULL DEFAULT 'pending',
    "processingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_job_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interviews" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "interviewKey" TEXT NOT NULL,
    "secureToken" TEXT NOT NULL,
    "status" "InterviewStatus" NOT NULL DEFAULT 'scheduled',
    "plan" JSONB NOT NULL DEFAULT '[]',
    "currentSectionIndex" INTEGER NOT NULL DEFAULT 0,
    "totalDuration" INTEGER NOT NULL DEFAULT 45,
    "elapsedSeconds" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "recordingUrl" TEXT,
    "transcript" TEXT,
    "candidateFeedback" JSONB NOT NULL DEFAULT '{}',
    "recordingConsent" BOOLEAN NOT NULL DEFAULT false,
    "recordingDisclosed" BOOLEAN NOT NULL DEFAULT false,
    "deviceInfo" JSONB NOT NULL DEFAULT '{}',
    "ipAddress" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_sessions" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastActivity" TIMESTAMP(3) NOT NULL,
    "state" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "interview_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_questions" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "isFollowUp" BOOLEAN NOT NULL DEFAULT false,
    "followUpToId" TEXT,
    "context" JSONB NOT NULL DEFAULT '{}',
    "sequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_answers" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcript_segments" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "speaker" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "text" TEXT NOT NULL,
    "segmentType" TEXT NOT NULL DEFAULT 'speech',
    "competency" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transcript_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_evaluations" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "technicalScore" DOUBLE PRECISION NOT NULL,
    "roleCompetency" DOUBLE PRECISION NOT NULL,
    "problemSolving" DOUBLE PRECISION NOT NULL,
    "practicalExp" DOUBLE PRECISION NOT NULL,
    "communication" DOUBLE PRECISION NOT NULL,
    "systemDesign" DOUBLE PRECISION NOT NULL,
    "resumeValidation" DOUBLE PRECISION NOT NULL,
    "strengths" JSONB NOT NULL DEFAULT '[]',
    "weaknesses" JSONB NOT NULL DEFAULT '[]',
    "skillGaps" JSONB NOT NULL DEFAULT '[]',
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "concerns" JSONB NOT NULL DEFAULT '[]',
    "recommendation" TEXT NOT NULL,
    "aiSummary" TEXT,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "processingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_reports" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "candidateInfo" JSONB NOT NULL,
    "jobInfo" JSONB NOT NULL,
    "resumeMatchScore" DOUBLE PRECISION NOT NULL,
    "interviewScore" DOUBLE PRECISION NOT NULL,
    "competencyScores" JSONB NOT NULL,
    "interviewSummary" TEXT NOT NULL,
    "strengths" JSONB NOT NULL DEFAULT '[]',
    "weaknesses" JSONB NOT NULL DEFAULT '[]',
    "skillGaps" JSONB NOT NULL DEFAULT '[]',
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "keyQa" JSONB NOT NULL DEFAULT '[]',
    "concerns" JSONB NOT NULL DEFAULT '[]',
    "aiRecommendation" TEXT NOT NULL,
    "hrDecision" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emails" (
    "id" TEXT NOT NULL,
    "type" "EmailType" NOT NULL,
    "recipient" TEXT NOT NULL,
    "recipientName" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "template" TEXT,
    "templateData" JSONB NOT NULL DEFAULT '{}',
    "status" "EmailStatus" NOT NULL DEFAULT 'pending',
    "jobId" TEXT,
    "candidateId" TEXT,
    "interviewId" TEXT,
    "organizationId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorEmail" TEXT,
    "organizationId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_processing_jobs" (
    "id" TEXT NOT NULL,
    "type" "AIJobType" NOT NULL,
    "status" "AIJobStatus" NOT NULL DEFAULT 'queued',
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT,
    "candidateId" TEXT,
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "error" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_processing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_configs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limits" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cached_embeddings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "embedding" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cached_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_slug_key" ON "jobs"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "candidates_externalId_key" ON "candidates"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "candidates_resumeId_key" ON "candidates"("resumeId");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_job_matches_processingId_key" ON "candidate_job_matches"("processingId");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_job_matches_candidateId_jobId_key" ON "candidate_job_matches"("candidateId", "jobId");

-- CreateIndex
CREATE UNIQUE INDEX "interviews_interviewKey_key" ON "interviews"("interviewKey");

-- CreateIndex
CREATE UNIQUE INDEX "interviews_secureToken_key" ON "interviews"("secureToken");

-- CreateIndex
CREATE UNIQUE INDEX "interview_sessions_token_key" ON "interview_sessions"("token");

-- CreateIndex
CREATE UNIQUE INDEX "interview_evaluations_interviewId_key" ON "interview_evaluations"("interviewId");

-- CreateIndex
CREATE UNIQUE INDEX "interview_evaluations_processingId_key" ON "interview_evaluations"("processingId");

-- CreateIndex
CREATE UNIQUE INDEX "interview_reports_interviewId_key" ON "interview_reports"("interviewId");

-- CreateIndex
CREATE UNIQUE INDEX "email_configs_organizationId_provider_key" ON "email_configs"("organizationId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limits_key_key" ON "rate_limits"("key");

-- CreateIndex
CREATE UNIQUE INDEX "cached_embeddings_key_key" ON "cached_embeddings"("key");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "resumes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resumes" ADD CONSTRAINT "resumes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_job_matches" ADD CONSTRAINT "candidate_job_matches_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_job_matches" ADD CONSTRAINT "candidate_job_matches_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_questions" ADD CONSTRAINT "interview_questions_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_answers" ADD CONSTRAINT "interview_answers_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_answers" ADD CONSTRAINT "interview_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "interview_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_evaluations" ADD CONSTRAINT "interview_evaluations_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_reports" ADD CONSTRAINT "interview_reports_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_configs" ADD CONSTRAINT "email_configs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
