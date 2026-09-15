import { z } from "zod";

export const antiPromptInjectionPatterns: RegExp[] = [
  /ignore\s+previous\s+instructions?/i,
  /forget\s+your\s+role/i,
  /you\s+are\s+(?:not|no)\s+(?:an?\s+)?AI/i,
  /system\s*prompt/i,
  /dev\s*:\s*/i,
  /human\s*:\s*/i,
  /assistant\s*:\s*/i,
  /<\|start_header_id\|>/,
  /\[INST\]/i,
];

export function antiPromptInjection(input: string): boolean {
  if (!input || typeof input !== "string") return false;
  const lowerInput = input.toLowerCase().trim();

  if (lowerInput.includes("ignore previous instructions")) return true;
  if (lowerInput.includes("forget your role")) return true;
  if (/you are (?:not|no) (?:an? )?ai/i.test(input)) return true;
  if (lowerInput.includes("system prompt")) return true;
  if (/dev:\s*/i.test(input)) return true;
  if (/human:\s*/i.test(input)) return true;
  if (/assistant:\s*/i.test(input)) return true;

  for (const pattern of antiPromptInjectionPatterns) {
    if (pattern.test(input)) return true;
  }

  if (input.length > 10000) return true;

  const suspiciousCommands = [
    "sudo", "rm -rf", "chmod", "wget", "curl", "nc ", "bash -c", "sh -c",
    "eval(", "exec(", "import ", "require(", "process.env", "process.argv",
  ];
  for (const cmd of suspiciousCommands) {
    if (lowerInput.includes(cmd)) return true;
  }

  return false;
}

export const resumeParserSchema = z.object({
  fileName: z.string(),
  fileContent: z.string(),
  mimeType: z.string(),
});

export type ResumeParserInput = z.infer<typeof resumeParserSchema>;

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

export function validateAIOutput<T>(schema: z.ZodType<T>, output: unknown): T {
  return schema.parse(output);
}

export function sanitizeInput(input: string): string {
  if (!input) return "";
  return input
    .replace(/<script[^>]*>.*?<\/script>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+\s*=/gi, "")
    .replace(/vbscript:/gi, "")
    .replace(/data:/gi, "")
    .replace(/expression\s*\(/gi, "")
    .replace(/url\s*\(/gi, "")
    .trim();
}
