import type { AIProvider } from "./providers";
import { antiPromptInjection, sanitizeInput } from "./security";

export type InterviewQuestionSpec = {
  text: string;
  type: string;
  difficulty: string;
  durationMinutes: number;
};

export type InterviewPlanSection = {
  section: string;
  title: string;
  questions: InterviewQuestionSpec[];
  durationMinutes: number;
};

export type InterviewPlan = {
  sections: InterviewPlanSection[];
  totalDurationMinutes: number;
  difficulty: string;
};

export type PlanInput = {
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
  candidateMatchScore: number;
  interviewDurationMinutes: number;
  difficulty: string;
};

const DEFAULT_DIFFICULTIES = ["easy", "medium", "hard"] as const;

function normalizeDifficulty(difficulty: string): string {
  const value = String(difficulty ?? "").toLowerCase();
  return DEFAULT_DIFFICULTIES.includes(value as (typeof DEFAULT_DIFFICULTIES)[number]) ? value : "medium";
}

function clampDuration(minutes: unknown): number {
  const value = Number(minutes);
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.round(value), 5), 45);
}

function sumDuration(questions: InterviewQuestionSpec[]): number {
  return questions.reduce((total, q) => total + q.durationMinutes, 0);
}

function extractJsonArray(content: string): Array<Record<string, unknown>> {
  if (!content) return [];
  const cleaned = content.replace(/```(?:json)?/gi, "").trim();
  const match = cleaned.match(/\[[\s\S]*\]/) || cleaned.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as unknown;
    return Array.isArray(parsed) ? (parsed as Array<Record<string, unknown>>) : [];
  } catch {
    return [];
  }
}

function fitToDuration(
  sections: InterviewPlanSection[],
  maxDuration: number
): InterviewPlanSection[] {
  const fitted: InterviewPlanSection[] = [];
  let remaining = Math.max(maxDuration, 10);

  for (const section of sections) {
    const questions: InterviewQuestionSpec[] = [];
    for (const question of section.questions) {
      if (question.durationMinutes <= remaining) {
        questions.push(question);
        remaining -= question.durationMinutes;
      } else {
        break;
      }
    }
    if (questions.length > 0) {
      fitted.push({
        ...section,
        questions,
        durationMinutes: questions.reduce((sum, q) => sum + q.durationMinutes, 0),
      });
    }
  }
  return fitted;
}

export class InterviewPlanner {
  private provider: AIProvider | null;

  constructor(provider: AIProvider | null, _config?: unknown) {
    this.provider = provider;
  }

  private get hasAI(): boolean {
    return Boolean(this.provider && this.provider.name !== "mock");
  }

  async planInterview(input: PlanInput): Promise<InterviewPlan> {
    const difficulty = normalizeDifficulty(input.difficulty);
    const duration = Math.max(input.interviewDurationMinutes || 45, 15);

    if (!this.hasAI) {
      return this.buildTemplatePlan(input, duration, difficulty);
    }

    try {
      const sections = await this.buildAIPlan(input, duration, difficulty);
      const fitted = fitToDuration(sections, duration);
      const total = fitted.reduce((sum, s) => sum + s.durationMinutes, 0);
      return {
        sections: fitted,
        totalDurationMinutes: Math.min(total, duration),
        difficulty,
      };
    } catch {
      return this.buildTemplatePlan(input, duration, difficulty);
    }
  }

  private buildTemplatePlan(
    input: PlanInput,
    duration: number,
    difficulty: string
  ): InterviewPlan {
    const sections: InterviewPlanSection[] = [
      this.introSection(),
    ];

    if (input.requiredSkills.length > 0) {
      const skills = input.requiredSkills.slice(0, 3);
      const questions = skills.map(
        (skill, index): InterviewQuestionSpec => ({
          text: `Walk me through your experience with ${skill}. Can you describe a project where you used it?`,
          type: "technical",
          difficulty: index === 0 ? "medium" : difficulty,
          durationMinutes: 10,
        })
      );
      sections.push({
        section: "technical",
        title: "Technical Assessment",
        questions,
        durationMinutes: sumDuration(questions),
      });
    }

    if (input.rolesResponsibilities.length > 0) {
      const questions = input.rolesResponsibilities.slice(0, 2).map(
        (responsibility): InterviewQuestionSpec => ({
          text: `Describe how you would approach: ${responsibility.title}`,
          type: "behavioral",
          difficulty,
          durationMinutes: 8,
        })
      );
      sections.push({
        section: "role-specific",
        title: "Role-Specific Questions",
        questions,
        durationMinutes: sumDuration(questions),
      });
    }

    if (input.candidateMatchScore >= 60) {
      sections.push({
        section: "system-design",
        title: "System Design",
        questions: [
          {
            text: `How would you design a system for ${input.jobTitle}?`,
            type: "design",
            difficulty,
            durationMinutes: 15,
          },
        ],
        durationMinutes: 15,
      });
    }

    sections.push(this.closingSection());

    const fitted = fitToDuration(sections, duration);
    const total = fitted.reduce((sum, s) => sum + s.durationMinutes, 0);
    return {
      sections: fitted,
      totalDurationMinutes: Math.min(total, duration),
      difficulty,
    };
  }

  private async buildAIPlan(
    input: PlanInput,
    duration: number,
    difficulty: string
  ): Promise<InterviewPlanSection[]> {
    const sections: InterviewPlanSection[] = [this.introSection()];

    if (input.requiredSkills.length > 0) {
      const questions = await this.generateSectionQuestions(
        "technical",
        input,
        3,
        10,
        difficulty
      );
      if (questions.length > 0) {
        sections.push({
          section: "technical",
          title: "Technical Assessment",
          questions,
          durationMinutes: sumDuration(questions),
        });
      }
    }

    if (input.rolesResponsibilities.length > 0) {
      const questions = await this.generateSectionQuestions(
        "role-specific",
        input,
        2,
        8,
        difficulty
      );
      if (questions.length > 0) {
        sections.push({
          section: "role-specific",
          title: "Role-Specific Questions",
          questions,
          durationMinutes: sumDuration(questions),
        });
      }
    }

    if (input.candidateMatchScore >= 60) {
      const questions = await this.generateSectionQuestions(
        "system-design",
        input,
        1,
        15,
        difficulty
      );
      if (questions.length > 0) {
        sections.push({
          section: "system-design",
          title: "System Design",
          questions,
          durationMinutes: sumDuration(questions),
        });
      }
    }

    sections.push(this.closingSection());
    return sections;
  }

  private introSection(): InterviewPlanSection {
    return {
      section: "introduction",
      title: "Introduction & Warm-up",
      questions: [
        {
          text: "Tell me about yourself and your background.",
          type: "open",
          difficulty: "easy",
          durationMinutes: 5,
        },
      ],
      durationMinutes: 5,
    };
  }

  private closingSection(): InterviewPlanSection {
    return {
      section: "closing",
      title: "Closing & Q&A",
      questions: [
        {
          text: "Do you have any questions about the role or team?",
          type: "open",
          difficulty: "easy",
          durationMinutes: 5,
        },
      ],
      durationMinutes: 5,
    };
  }

  private buildTopic(
    kind: "technical" | "role-specific" | "system-design",
    input: PlanInput
  ): string {
    switch (kind) {
      case "technical":
        return `Role: ${input.jobTitle}\nRequired skills: ${input.requiredSkills.slice(0, 6).join(", ") || "none"}`;
      case "role-specific":
        return input.rolesResponsibilities
          .slice(0, 3)
          .map((r) => `- ${r.title}: ${sanitizeInput(r.description || "").slice(0, 150)}`)
          .join("\n");
      case "system-design":
        return `Role: ${input.jobTitle}\nDomain: ${sanitizeInput(input.jobDescription || "").slice(0, 200)}`;
      default:
        return input.jobTitle;
    }
  }

  private fallbackQuestions(
    kind: "technical" | "role-specific" | "system-design",
    input: PlanInput,
    count: number,
    defaultDuration: number,
    difficulty: string
  ): InterviewQuestionSpec[] {
    const questions: InterviewQuestionSpec[] = [];
    for (let index = 0; index < count; index += 1) {
      let text = "";
      let type = "technical";
      if (kind === "technical") {
        const skill = input.requiredSkills[index % Math.max(input.requiredSkills.length, 1)];
        text = `Walk me through your experience with ${skill}. Can you describe a project where you used it?`;
      } else if (kind === "role-specific") {
        const responsibility = input.rolesResponsibilities[index % Math.max(input.rolesResponsibilities.length, 1)];
        text = `Describe how you would approach: ${responsibility.title}`;
        type = "behavioral";
      } else {
        text = `How would you design a system for ${input.jobTitle}?`;
        type = "design";
      }
      questions.push({
        text,
        type,
        difficulty: kind === "technical" && index > 0 ? difficulty : "medium",
        durationMinutes: defaultDuration,
      });
    }
    return questions;
  }

  private async generateSectionQuestions(
    kind: "technical" | "role-specific" | "system-design",
    input: PlanInput,
    count: number,
    defaultDuration: number,
    difficulty: string
  ): Promise<InterviewQuestionSpec[]> {
    const fallback = this.fallbackQuestions(kind, input, count, defaultDuration, difficulty);
    if (!this.hasAI || !this.provider) {
      return fallback;
    }

    const topic = this.buildTopic(kind, input);
    const system =
      "You are an expert technical interviewer. Generate interview questions for the given role. " +
      "Respond with ONLY a JSON array and nothing else. Each element must be an object with exactly " +
      '"text" (string), "type" (string), "difficulty" ("easy"|"medium"|"hard"), "durationMinutes" (number).';

    const user = `Section: ${kind}\nRole: ${input.jobTitle}\nDifficulty: ${difficulty}\nRequested question count: ${count}\n\n${topic}`;

    let content = "";
    try {
      const response = await this.provider.complete({
        model: "gpt-4o",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        maxTokens: 500,
        temperature: 0.7,
      });
      content = response.content || "";
    } catch {
      return fallback;
    }

    const items = extractJsonArray(content);
    const questions: InterviewQuestionSpec[] = [];
    for (const item of items.slice(0, count)) {
      const rawText = typeof item.text === "string" ? item.text : "";
      if (!rawText.trim()) continue;
      const text = sanitizeInput(rawText).trim();
      if (!text || antiPromptInjection(text)) continue;
      if (questions.length >= count) break;
      questions.push({
        text,
        type: typeof item.type === "string" && item.type.trim() ? item.type : "technical",
        difficulty: normalizeDifficulty(typeof item.difficulty === "string" ? item.difficulty : difficulty),
        durationMinutes: clampDuration(item.durationMinutes) || defaultDuration,
      });
    }

    for (const fallbackQuestion of fallback) {
      if (questions.length >= count) break;
      questions.push(fallbackQuestion);
    }

    return questions;
  }

  async generateQuestion(
    topic: string,
    difficulty: string,
    context?: Record<string, unknown>
  ): Promise<string> {
    const normalized = normalizeDifficulty(difficulty);
    const fallback = `Question about ${topic} at ${normalized} level`;
    if (!this.hasAI || !this.provider) {
      return fallback;
    }

    const contextText = context && Object.keys(context).length > 0
      ? `\nContext: ${sanitizeInput(JSON.stringify(context)).slice(0, 500)}`
      : "";
    const system =
      "You are an expert interviewer. Generate exactly one interview question about the given topic. " +
      "Return only the question text, no labels, no JSON, no markdown.";

    try {
      const response = await this.provider.complete({
        model: "gpt-4o",
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: `Topic: ${sanitizeInput(topic)}\nDifficulty: ${normalized}${contextText}`,
          },
        ],
        maxTokens: 200,
        temperature: 0.8,
      });
      const text = sanitizeInput(response.content || "").trim();
      if (!text || antiPromptInjection(text)) {
        return fallback;
      }
      return text;
    } catch {
      return fallback;
    }
  }
}