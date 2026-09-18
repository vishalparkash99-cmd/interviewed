import { z } from "zod";
import type { AIProvider } from "./providers";
import { antiPromptInjection, sanitizeInput } from "./security";
import {
  questionFeedbackSchema,
  questionFeedbackListSchema,
  type DiagnosticScore,
  type QuestionFeedback,
} from "./schemas";

export type DiagnosticFeedbackItemInput = {
  questionId: string;
  question: string;
  questionType: string;
  difficulty: string;
  answer: string;
  durationSeconds?: number;
};

export type DiagnosticFeedbackInput = {
  interviewId: string;
  jobTitle: string;
  jobDescription: string;
  requiredSkills: string[];
  items: DiagnosticFeedbackItemInput[];
};

const ANSWER_LIMIT = 3000;
const QUESTION_LIMIT = 500;
const JD_LIMIT = 4000;

function clampScore(num: unknown, fallback: number): number {
  const value = Number(num);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.round(value), 0), 100);
}

function cleanText(text: string, max: number): string {
  const sanitized = sanitizeInput(text || "");
  return sanitized.length > max ? `${sanitized.slice(0, max)}...` : sanitized;
}

function extractJsonArray(content: string): Array<Record<string, unknown>> {
  if (!content) return [];
  const cleaned = content.replace(/```(?:json)?/gi, "").trim();
  const match = cleaned.match(/\[[\s\S]*\]/) || cleaned.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as unknown;
    if (Array.isArray(parsed)) return parsed as Array<Record<string, unknown>>;
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      if (Array.isArray(record.feedback)) return record.feedback as Array<Record<string, unknown>>;
      if (Array.isArray(record.items)) return record.items as Array<Record<string, unknown>>;
    }
  } catch {
    // fall through
  }
  return [];
}

function hasAnswer(item: DiagnosticFeedbackItemInput): boolean {
  const text = (item.answer || "").trim();
  return text.length > 0;
}

function skillCoverage(answer: string, requiredSkills: string[]): { matched: string[]; missing: string[] } {
  const lower = answer.toLowerCase();
  const matched = requiredSkills.filter((skill) => skill && lower.includes(skill.toLowerCase()));
  const missing = requiredSkills.filter((skill) => skill && !lower.includes(skill.toLowerCase()));
  return { matched, missing };
}

function measureStructure(answer: string, jobTitle: string, requiredSkills: string[]): number {
  const lower = answer.toLowerCase();
  let score = 30;

  if (/\b(first(?:ly)?|second(?:ly)?|third(?:ly)?|then|next|finally|lastly|in conclusion)\b/.test(lower)) score += 15;
  if (/(?:^|\n)\s*(?:-|\*|\d+[.)])/.test(answer)) score += 10;

  const paragraphs = answer.split(/\n{2,}/).filter((p) => p.trim().length > 20).length;
  const clauses = (lower.match(/\b(because|as |so that|in order to|which means|could|would)\b/g) || []).length;
  if (paragraphs >= 1) score += 10;
  if (clauses >= 2) score += 10;

  if (requiredSkills.length && skillCoverage(answer, requiredSkills).matched.length > 0) score += 15;

  const mentionsJob = jobTitle ? lower.includes(jobTitle.toLowerCase()) : false;
  if (mentionsJob) score += 10;

  const anyQuantified = /\b\d+(?:%|x| times| requests| ms| seconds| users| years)?\b/.test(answer);
  if (anyQuantified) score += 10;

  return Math.min(Math.max(Math.round(score), 0), 100);
}

export function buildDeterministicQuestionFeedback(
  item: DiagnosticFeedbackItemInput,
  requiredSkills: string[],
  source: "deterministic" = "deterministic"
): QuestionFeedback & { source?: string } {
  const hasAnswerText = hasAnswer(item);
  const answer = cleanText(item.answer, ANSWER_LIMIT);
  const safeQuestion = cleanText(item.question, QUESTION_LIMIT);

  const normalizedScore = (score: number): number => Math.min(Math.max(Math.round(score), 0), 100);

  let technicalAccuracy: number;
  let communicationClarity: number;
  let problemSolvingStructure: number;
  let pacingAndConciseness: number;
  let overallScore: number;

  const strengths: string[] = [];
  const keyOmissions: string[] = [];
  const actionableTips: string[] = [];

  const { matched, missing } = skillCoverage(answer, requiredSkills.slice(0, 10));

  if (!hasAnswerText) {
    technicalAccuracy = 0;
    communicationClarity = 0;
    problemSolvingStructure = 0;
    pacingAndConciseness = 0;
    overallScore = 0;
    keyOmissions.push("No answer was recorded for this question", "Core reasoning process was not demonstrated");
    actionableTips.push(
      "Always provide at least a structured outline, even when unsure of the exact answer",
      `Anchor your answer to the skills this question targets: ${requiredSkills.slice(0, 6).join(", ") || "the role requirements"}`
    );
  } else {
    const avgWordCount = answer.trim().split(/\s+/).length || 0;
    const lengthScore = Math.min(100, Math.round((avgWordCount / 200) * 100));
    const isLong = avgWordCount > 600;
    const isVeryShort = avgWordCount < 30;

    technicalAccuracy = normalizedScore(35 + (matched.length / 10) * 60 + (answer.length > 80 ? 5 : 0));
    if (technicalAccuracy > 100) technicalAccuracy = 100;
    if (matched.length > 0) strengths.push(`Demonstrated knowledge of ${matched.slice(0, 4).join(", ")}`);
    if (isVeryShort) keyOmissions.push("The answer is too brief to demonstrate technical depth");

    communicationClarity = normalizedScore(
      35 + Math.min(lengthScore, 70) + (/\b(because|therefore|as a result|so that)\b/i.test(answer) ? 8 : 0) + (isLong ? -15 : 0)
    );
    if (/\b(because|therefore|as a result|so that)\b/i.test(answer) && !isVeryShort) {
      strengths.push("Explanations were logically connected");
    }
    if (isLong) keyOmissions.push("The answer rambles and loses focus");

    problemSolvingStructure = measureStructure(answer, item.questionType, requiredSkills);
    if (problemSolvingStructure >= 70) strengths.push("Answer followed a clear, structured approach");
    else keyOmissions.push("Answer lacked an explicit structure (e.g. problem, approach, result)");

    pacingAndConciseness = normalizedScore(
      avgWordCount === 0 ? 0 : isVeryShort ? 45 : isLong ? 40 : Math.min(100, 80 - Math.max(0, avgWordCount - 160) * 0.2)
    );
    if (avgWordCount > 500) actionableTips.push("Trim filler words and re-read your answer for conciseness");

    const answeredFactor = 0.75 + matched.length * 0.02;
    overallScore = normalizedScore(
      (technicalAccuracy + communicationClarity + problemSolvingStructure + pacingAndConciseness) / 4 * Math.min(answeredFactor, 1.1)
    );
  }

  if (missing.length > 0) {
    keyOmissions.push(`Not evidenced: ${missing.slice(0, 5).join(", ")}`);
  }

  if (item.durationSeconds) {
    const sec = item.durationSeconds;
    if (sec < 30 && hasAnswerText) {
      pacingAndConciseness = normalizedScore(Math.max(overallScore, 65));
    }
  }

  if (actionableTips.length === 0) {
    actionableTips.push("Quantify outcomes with concrete numbers to strengthen your answer");
  }

  const improvedAnswer = buildSampleAnswer(item, matched.slice(0, 5), hasAnswerText);

  return {
    questionId: item.questionId,
    scores: {
      technicalAccuracy,
      communicationClarity,
      problemSolvingStructure,
      pacingAndConciseness,
      overallScore,
    },
    strengths,
    keyOmissions,
    improvedAnswer,
    actionableTips,
    ...(source === "deterministic" ? { source: "deterministic" as const } : {}),
  };
}

function buildSampleAnswer(item: DiagnosticFeedbackItemInput, matchedSkills: string[], hasAnswerText: boolean): string {
  const safeQuestion = cleanText(item.question, QUESTION_LIMIT);
  const skillPhrase = matchedSkills.length
    ? `drawing directly on my experience with ${matchedSkills.join(", ")}`
    : `grounded in the core requirements of the role`;
  const base =
    `Structured response: First, I will clarify the objective behind "${safeQuestion}" and scope the problem explicitly. ` +
    `Then I will lay out my approach ${skillPhrase}, covering the key technical trade-offs and the reasoning behind each decision. ` +
    `Next I will highlight concrete results, quantifying impact where possible. ` +
    `Finally, I will summarise the outcome, note any edge cases or follow-ups, and invite questions.`;
  if (!hasAnswerText) {
    return base;
  }
  return `${base}\n\nA top-tier variant would open with a one-sentence direct answer, follow a "Situation → Approach → Result" arc, and close with a self-correction: "One thing I would revisit in production is…"`;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 12);
  }
  return [];
}

function asScores(value: unknown): DiagnosticScore {
  const record = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Record<string, unknown>;
  return {
    technicalAccuracy: clampScore(record.technicalAccuracy, 0),
    communicationClarity: clampScore(record.communicationClarity, 0),
    problemSolvingStructure: clampScore(record.problemSolvingStructure, 0),
    pacingAndConciseness: clampScore(record.pacingAndConciseness, 0),
    overallScore: clampScore(record.overallScore, 0),
  };
}

function normalizeRawFeedback(
  item: DiagnosticFeedbackItemInput,
  raw: Record<string, unknown>,
  fallback: QuestionFeedback
): QuestionFeedback {
  const strengths = asStringArray(raw.strengths);
  const keyOmissions = asStringArray(raw.keyOmissions);
  const actionableTips = asStringArray(raw.actionableTips);
  const improvedAnswer = typeof raw.improvedAnswer === "string" && raw.improvedAnswer.trim().length > 0
    ? sanitizeInput(raw.improvedAnswer).slice(0, 6000)
    : fallback.improvedAnswer;

  const scores = asScores(raw.scores);
  const candidates = {
    ...fallback.scores,
    technicalAccuracy: scores.technicalAccuracy,
    communicationClarity: scores.communicationClarity,
    problemSolvingStructure: scores.problemSolvingStructure,
    pacingAndConciseness: scores.pacingAndConciseness,
    overallScore: scores.overallScore,
  };

  return {
    questionId: item.questionId,
    scores: {
      technicalAccuracy: candidates.technicalAccuracy || fallback.scores.technicalAccuracy,
      communicationClarity: candidates.communicationClarity || fallback.scores.communicationClarity,
      problemSolvingStructure: candidates.problemSolvingStructure || fallback.scores.problemSolvingStructure,
      pacingAndConciseness: candidates.pacingAndConciseness || fallback.scores.pacingAndConciseness,
      overallScore: candidates.overallScore || fallback.scores.overallScore,
    },
    strengths: strengths.length ? strengths : fallback.strengths,
    keyOmissions: keyOmissions.length ? keyOmissions : fallback.keyOmissions,
    improvedAnswer: improvedAnswer || fallback.improvedAnswer,
    actionableTips: actionableTips.length ? actionableTips : fallback.actionableTips,
  };
}

export function validateDiagnosticFeedbackInput(input: unknown): DiagnosticFeedbackInput {
  const schema = z.object({
    interviewId: z.string().min(1),
    jobTitle: z.string(),
    jobDescription: z.string(),
    requiredSkills: z.array(z.string()),
    items: z.array(
      z.object({
        questionId: z.string().min(1),
        question: z.string(),
        questionType: z.string(),
        difficulty: z.string(),
        answer: z.string(),
        durationSeconds: z.number().optional(),
      })
    ),
  });
  return schema.parse(input);
}

export class DiagnosticFeedbackEngine {
  private provider: AIProvider | null;

  constructor(provider: AIProvider | null, _config?: unknown) {
    this.provider = provider;
  }

  private get hasAI(): boolean {
    return Boolean(this.provider && this.provider.name !== "mock");
  }

  async generateFeedback(input: DiagnosticFeedbackInput): Promise<QuestionFeedback[]> {
    const outputs: QuestionFeedback[] = [];

    if (!this.hasAI || !this.provider) {
      for (const item of input.items) {
        outputs.push(buildDeterministicQuestionFeedback(item, input.requiredSkills));
      }
      return outputs;
    }

    const system =
      "You are a senior technical interviewer providing diagnostic, actionable feedback on interview answers. " +
      "Return ONLY valid JSON and nothing else (no markdown fences). " +
      "The JSON must be an ARRAY of objects, each with exactly: " +
      '"questionId" (string), "scores" (object with technicalAccuracy, communicationClarity, ' +
      'problemSolvingStructure, pacingAndConciseness, overallScore — each an integer 0-100), ' +
      '"strengths" (array of strings), "keyOmissions" (array of strings), ' +
      '"improvedAnswer" (string — a concise "top 1% sample answer" to the question), ' +
      '"actionableTips" (array of strings). ' +
      "Do NOT evaluate based on protected characteristics. Base scores only on the provided question and answer.";

    const questionAnswerPairs = input.items
      .map((item) => {
        const safeQ = cleanText(item.question, QUESTION_LIMIT);
        const safeA = cleanText(item.answer, ANSWER_LIMIT);
        return `QID: ${item.questionId}\nQ: ${safeQ}\nTYPE: ${item.questionType} | DIFFICULTY: ${item.difficulty}\nA: ${safeA || "No answer recorded"}`;
      })
      .join("\n\n");

    const user = [
      `INTERVIEW ID: ${input.interviewId}`,
      `JOB TITLE: ${input.jobTitle || "Unknown"}`,
      `REQUIRED SKILLS: ${input.requiredSkills.slice(0, 15).join(", ") || "none"}`,
      `JOB DESCRIPTION: ${cleanText(input.jobDescription, JD_LIMIT) || "none"}`,
      `\nQUESTION & ANSWER PAIRS:\n${questionAnswerPairs}`,
    ].join("\n");

    let content = "";
    try {
      const response = await this.provider.complete({
        model: "gpt-4o",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        maxTokens: 4000,
        temperature: 0.3,
      });
      content = response.content || "";
    } catch {
      content = "";
    }

    const rawItems = extractJsonArray(content);
    const rawById = new Map<string, Record<string, unknown>>();
    for (const raw of rawItems) {
      const id = typeof raw.questionId === "string" ? raw.questionId : "";
      if (id && !rawById.has(id)) rawById.set(id, raw);
    }

    for (const item of input.items) {
      const fallback = buildDeterministicQuestionFeedback(item, input.requiredSkills);
      if (antiPromptInjection(item.answer) || antiPromptInjection(item.question)) {
        outputs.push({ ...fallback, strengths: ["Question or answer flagged by security policy"] });
        continue;
      }
      const raw = rawById.get(item.questionId);
      if (!raw) {
        outputs.push(fallback);
        continue;
      }
      const normalized = normalizeRawFeedback(item, raw, fallback);
      const parsed = questionFeedbackSchema.safeParse(normalized);
      outputs.push(parsed.success ? parsed.data : fallback);
    }

    return outputs;
  }
}

// Validates a complete generated list (used as a secondary check by consumers).
export function validateQuestionFeedbackList(value: unknown): QuestionFeedback[] {
  return questionFeedbackListSchema.parse(value);
}

export function validateQuestionFeedback(value: unknown): QuestionFeedback {
  return questionFeedbackSchema.parse(value);
}