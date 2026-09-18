import { z } from "zod";

export const createJobSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().min(1).max(20000),
  department: z.string().max(100).optional(),
  location: z.string().max(200).optional(),
  employmentType: z.enum(["fulltime", "parttime", "contract", "internship"]).default("fulltime"),
  experienceMinYears: z.number().min(0).max(70).default(0),
  experienceMaxYears: z.number().min(0).max(70).default(0),
  rolesResponsibilities: z.array(z.string().min(1).max(2000)).max(100).optional(),
  requiredSkills: z.array(z.string().min(1).max(200)).max(200).optional(),
  preferredSkills: z.array(z.string().min(1).max(200)).max(200).optional(),
  requiredQualifications: z.array(z.string().min(1).max(2000)).max(100).optional(),
  preferredQualifications: z.array(z.string().min(1).max(2000)).max(100).optional(),
  domain: z.string().max(100).optional(),
  customScreeningCriteria: z.record(z.unknown()).optional(),
  interviewDuration: z.number().min(5).max(180).default(45),
  interviewDifficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  shortlistCount: z.number().min(1).max(100).default(10),
  minimumScreeningScore: z.number().min(0).max(100).default(60),
  scoringWeights: z.object({
    technical: z.number().min(0).max(100).default(30),
    experience: z.number().min(0).max(100).default(25),
    responsibilities: z.number().min(0).max(100).default(25),
    qualification: z.number().min(0).max(100).default(10),
    domain: z.number().min(0).max(100).default(10),
  }).optional(),
  interviewConfig: z.record(z.unknown()).optional(),
});

export const updateJobSchema = createJobSchema.partial();

export const createCandidateSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(254),
  phone: z.string().max(50).optional(),
  location: z.string().max(200).optional(),
  yearsOfExperience: z.number().min(0).max(70).default(0),
  resumeId: z.string().max(64).optional(),
  currentJobTitle: z.string().max(200).optional(),
  currentCompany: z.string().max(200).optional(),
  linkedinUrl: z.string().url().max(2000).optional(),
  portfolioUrl: z.string().url().max(2000).optional(),
  normalizedData: z.record(z.unknown()).optional(),
  status: z.enum(["active", "screened", "shortlisted", "rejected", "hired", "archived"]).default("active"),
});

export const updateCandidateSchema = createCandidateSchema.partial();

export const createInterviewSchema = z.object({
  candidateId: z.string().min(1).max(64),
  jobId: z.string().min(1).max(64),
  duration: z.number().min(5).max(180).default(45),
  recordingConsent: z.boolean().default(false),
  recordingDisclosed: z.boolean().default(false),
  deviceInfo: z.record(z.unknown()).optional(),
});

export const shortlistCandidateSchema = z.object({
  candidateId: z.string().min(1).max(64),
  jobId: z.string().min(1).max(64),
  decision: z.enum(["approve", "reject"]),
});

export const createEmailSchema = z.object({
  type: z.enum(["invitation", "reminder", "result", "welcome", "password_reset", "reschedule", "cancellation", "completion"]).default("invitation"),
  recipient: z.string().email().max(254),
  recipientName: z.string().max(200).optional(),
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(50000),
  template: z.string().max(100).optional(),
  templateData: z.record(z.unknown()).optional(),
  jobId: z.string().max(64).optional(),
  candidateId: z.string().max(64).optional(),
  interviewId: z.string().max(64).optional(),
});

export const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(256),
});

export const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(256),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  companyName: z.string().min(1).max(200),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1).max(512),
});

export const resendVerificationSchema = z.object({
  email: z.string().email().max(254),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email().max(254),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1).max(512),
  password: z.string().min(8).max(256),
});

export const createQuestionSchema = z.object({
  section: z.string().min(1).max(100),
  question: z.string().min(1).max(4000),
  type: z.string().min(1).max(50),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  isFollowUp: z.boolean().optional(),
  context: z.record(z.unknown()).optional(),
  followUpToId: z.string().max(64).optional(),
});

export const submitAnswerSchema = z.object({
  interviewToken: z.string().min(1).max(512),
  questionId: z.string().min(1).max(64),
  answer: z.string().min(1).max(12000),
  durationSeconds: z.number().min(0).max(3600).default(0),
  confidence: z.number().min(0).max(100).default(50),
});

export const joinInterviewSchema = z.object({
  interviewToken: z.string().min(1).max(512),
});

export const rescheduleInterviewSchema = z.object({
  duration: z.number().int().min(5).max(180).optional(),
});

export const completeInterviewSchema = z.object({
  interviewToken: z.string().min(1).max(512),
});
