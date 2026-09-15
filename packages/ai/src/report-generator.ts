import { z } from "zod";
import { hrReportSchema } from "./schemas";

export type ReportInput = {
  interviewId: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  jobDescription: string;
  resumeMatchScore: number;
  interviewScore: number;
  competencyScores: Record<string, number>;
  strengths: string[];
  weaknesses: string[];
  skillGaps: string[];
  evidence: Array<{ text: string; score: number }>;
  keyQa: Array<{ question: string; answer: string; score?: number }>;
  aiRecommendation: string;
};

export function validateReportInput(input: unknown): z.infer<typeof hrReportSchema> {
  const schema = hrReportSchema.extend({
    hrDecision: z.record(z.unknown()).optional(),
    hrDecisionBy: z.string().optional(),
    hrDecisionAt: z.string().optional(),
  });
  return schema.parse(input);
}
