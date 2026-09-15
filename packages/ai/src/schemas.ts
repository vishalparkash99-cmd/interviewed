import { z } from "zod";

export const resumeParserSchema = z.object({
  fileName: z.string(),
  fileContent: z.string(),
  mimeType: z.string(),
});

export type ResumeParserInput = z.infer<typeof resumeParserSchema>;

export const parsedResumeSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  yearsOfExperience: z.number().min(0).max(100).optional(),
  skills: z.array(z.string()).optional(),
  experience: z
    .array(
      z.object({
        title: z.string().optional(),
        company: z.string().optional(),
        summary: z.string().optional(),
      })
    )
    .optional(),
  education: z
    .array(
      z.object({
        degree: z.string().optional(),
        institution: z.string().optional(),
        field: z.string().optional(),
      })
    )
    .optional(),
  certifications: z.array(z.string()).optional(),
});

export type ParsedResume = z.infer<typeof parsedResumeSchema>;

export const evaluationReportSchema = z.object({
  interviewId: z.string(),
  overallScore: z.number().min(0).max(100),
  technicalScore: z.number().min(0).max(100),
  roleCompetency: z.number().min(0).max(100),
  problemSolving: z.number().min(0).max(100),
  practicalExp: z.number().min(0).max(100),
  communication: z.number().min(0).max(100),
  systemDesign: z.number().min(0).max(100),
  resumeValidation: z.number().min(0).max(100),
  strengths: z.array(z.string()).optional(),
  weaknesses: z.array(z.string()).optional(),
  skillGaps: z.array(z.string()).optional(),
  evidence: z.array(z.any()).optional(),
  concerns: z.array(z.string()).optional(),
  recommendation: z.string(),
  aiSummary: z.string().optional(),
});

export type EvaluationReport = z.infer<typeof evaluationReportSchema>;

export const hrReportSchema = z.object({
  interviewId: z.string(),
  candidateName: z.string(),
  candidateEmail: z.string(),
  jobTitle: z.string(),
  resumeMatchScore: z.number().min(0).max(100),
  interviewScore: z.number().min(0).max(100),
  competencyScores: z.record(z.string(), z.number()),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  skillGaps: z.array(z.string()),
  evidence: z.array(z.object({ text: z.string(), score: z.number() })),
  keyQa: z.array(z.object({ question: z.string(), answer: z.string(), score: z.number().optional() })),
  aiRecommendation: z.string(),
  hrDecision: z.record(z.unknown()).optional(),
  hrDecisionBy: z.string().optional(),
  hrDecisionAt: z.string().optional(),
});

export type HRReport = z.infer<typeof hrReportSchema>;

export const aiReportNarrativeSchema = z.object({
  interviewSummary: z.string(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  skillGaps: z.array(z.string()),
  concerns: z.array(z.string()),
  aiRecommendation: z.string(),
});

export type AIReportNarrative = z.infer<typeof aiReportNarrativeSchema>;

export const interviewQuestionSchema = z.object({
  text: z.string(),
  type: z.string(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  durationMinutes: z.number().min(1).max(60),
});

export type InterviewQuestionSpec = z.infer<typeof interviewQuestionSchema>;

export const interviewPlanSchema = z.object({
  questions: z.array(interviewQuestionSchema),
});

export type InterviewPlanOutput = z.infer<typeof interviewPlanSchema>;