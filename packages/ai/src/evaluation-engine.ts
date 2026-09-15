import { z } from "zod";
import { evaluationReportSchema } from "./schemas";

export type EvaluationInput = {
  interviewId: string;
  jobId: string;
  candidateId: string;
  jobTitle: string;
  jobDescription: string;
  requiredSkills: string[];
  rolesResponsibilities: Array<{ title: string; description: string }>;
  candidateResume: {
    name: string;
    yearsOfExperience: number;
    skills: string[];
    experience: Array<{ title: string; company: string; summary: string }>;
  };
  transcriptSegments: Array<{
    speaker: string;
    text: string;
    competency?: string;
  }>;
  questions: Array<{
    id: string;
    text: string;
    type: string;
    difficulty: string;
  }>;
};

export function validateEvaluationInput(input: unknown): EvaluationInput {
  const schema = z.object({
    interviewId: z.string(),
    jobId: z.string(),
    candidateId: z.string(),
    jobTitle: z.string(),
    jobDescription: z.string(),
    requiredSkills: z.array(z.string()),
    rolesResponsibilities: z.array(z.object({ title: z.string(), description: z.string() })),
    candidateResume: z.object({
      name: z.string(),
      yearsOfExperience: z.number(),
      skills: z.array(z.string()),
      experience: z.array(z.object({ title: z.string(), company: z.string(), summary: z.string() })),
    }),
    transcriptSegments: z.array(z.object({ speaker: z.string(), text: z.string(), competency: z.string().optional() })),
    questions: z.array(z.object({ id: z.string(), text: z.string(), type: z.string(), difficulty: z.string() })),
  });
  return schema.parse(input);
}
