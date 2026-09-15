import { z } from "zod";

export const createJobSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  department: z.string().optional(),
  location: z.string().optional(),
  employmentType: z.enum(["fulltime", "parttime", "contract", "internship"]).default("fulltime"),
  experienceMinYears: z.number().min(0).default(0),
  experienceMaxYears: z.number().min(0).default(0),
  rolesResponsibilities: z.array(z.string()).optional(),
  requiredSkills: z.array(z.string()).optional(),
  preferredSkills: z.array(z.string()).optional(),
  requiredQualifications: z.array(z.string()).optional(),
  preferredQualifications: z.array(z.string()).optional(),
  domain: z.string().optional(),
  customScreeningCriteria: z.record(z.unknown()).optional(),
  interviewDuration: z.number().min(5).max(180).default(45),
  interviewDifficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  shortlistCount: z.number().min(1).default(10),
  minimumScreeningScore: z.number().min(0).max(100).default(60),
  scoringWeights: z.object({
    technical: z.number().default(30),
    experience: z.number().default(25),
    responsibilities: z.number().default(25),
    qualification: z.number().default(10),
    domain: z.number().default(10),
  }).optional(),
  interviewConfig: z.record(z.unknown()).optional(),
});

export const updateJobSchema = createJobSchema.partial();

export const createCandidateSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  location: z.string().optional(),
  yearsOfExperience: z.number().min(0).default(0),
  resumeId: z.string().optional(),
  currentJobTitle: z.string().optional(),
  currentCompany: z.string().optional(),
  linkedinUrl: z.string().url().optional(),
  portfolioUrl: z.string().url().optional(),
  normalizedData: z.record(z.unknown()).optional(),
  status: z.enum(["active", "screened", "shortlisted", "rejected", "hired", "archived"]).default("active"),
});

export const updateCandidateSchema = createCandidateSchema.partial();

export const createInterviewSchema = z.object({
  candidateId: z.string(),
  jobId: z.string(),
  duration: z.number().min(5).max(180).default(45),
  recordingConsent: z.boolean().default(false),
  recordingDisclosed: z.boolean().default(false),
  deviceInfo: z.record(z.unknown()).optional(),
});

export const shortlistCandidateSchema = z.object({
  candidateId: z.string(),
  jobId: z.string(),
  decision: z.enum(["approve", "reject"]),
});

export const createEmailSchema = z.object({
  type: z.enum(["invitation", "reminder", "result", "welcome", "password_reset"]).default("invitation"),
  recipient: z.string().email(),
  recipientName: z.string().optional(),
  subject: z.string().min(1),
  body: z.string().min(1),
  template: z.string().optional(),
  templateData: z.record(z.unknown()).optional(),
  jobId: z.string().optional(),
  candidateId: z.string().optional(),
  interviewId: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  companyName: z.string().min(1),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

export const resendVerificationSchema = z.object({
  email: z.string().email(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(6),
});
