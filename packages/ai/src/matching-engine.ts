import { z } from "zod";
import type { AIProvider } from "./providers";
import type { AICompletionRequest } from "./types";
import { antiPromptInjection, sanitizeInput, validateAIOutput } from "./security";
import { evaluationReportSchema, type EvaluationReport } from "./schemas";

export type MatchingEngineConfig = {
  weights: {
    skillMatch: number;
    experience: number;
    responsibilities: number;
    qualifications: number;
    domain: number;
  };
  minScore: number;
  maxScore: number;
};

const defaultWeights = {
  skillMatch: 0.30,
  experience: 0.25,
  responsibilities: 0.25,
  qualifications: 0.10,
  domain: 0.10,
};

export type ResumeData = {
  name: string;
  yearsOfExperience: number;
  skills: string[];
  experience: Array<{ title: string; company: string; summary: string }>;
};

export type JobRequirements = {
  requiredSkills: string[];
  preferredSkills: string[];
  requiredQualifications: string[];
  preferredQualifications: string[];
  rolesResponsibilities: Array<{ title: string; description: string }>;
  domain: string;
  experienceMinYears?: number;
  experienceMaxYears?: number;
};

export type MatchResult = {
  overallScore: number;
  skillScore: number;
  experienceScore: number;
  responsibilityScore: number;
  qualificationScore: number;
  domainScore: number;
  strengths: string[];
  gaps: string[];
  missingRequirements: string[];
  evidence: Array<{ text: string; score: number }>;
  recommendation: string;
};

export class MatchingEngine {
  private provider: AIProvider;
  private weights: MatchingEngineConfig["weights"];

  constructor(
    provider: AIProvider,
    weights?: Partial<MatchingEngineConfig["weights"]>,
    _cache?: unknown
  ) {
    this.provider = provider;
    this.weights = { ...defaultWeights, ...weights };
  }

  computeSkillScore(
    candidateSkills: string[],
    requiredSkills: string[],
    _preferredSkills: string[] = []
  ): number {
    if (!requiredSkills.length) return 70;

    const candidateSet = new Set(candidateSkills.map((s) => s.toLowerCase()));
    const matched = requiredSkills.filter((s) => candidateSet.has(s.toLowerCase())).length;
    const rawScore = (matched / requiredSkills.length) * 100;

    const bonus = Math.min((candidateSet.size / Math.max(requiredSkills.length, 1)) * 10, 10);
    const score = Math.min(Math.max(rawScore + bonus, 30), 100);

    return Math.round(score);
  }

  computeExperienceScore(
    candidateYears: number,
    minYears: number,
    maxYears: number
  ): number {
    if (minYears === 0 && maxYears === 0) return 75;
    if (maxYears > 0 && candidateYears >= maxYears) return 100;
    if (candidateYears >= minYears) {
      if (maxYears <= minYears) return 85;
      const ratio = (candidateYears - minYears) / (maxYears - minYears);
      return Math.round(70 + ratio * 30);
    }
    if (minYears <= 0) return 75;
    const ratio = candidateYears / minYears;
    return Math.round(Math.min(ratio * 60, 60));
  }

  async matchCandidate(
    resume: ResumeData,
    job: JobRequirements
  ): Promise<MatchResult> {
    const skillScore = this.computeSkillScore(resume.skills, job.requiredSkills, job.preferredSkills);
    const minYears = job.experienceMinYears ?? (job.requiredQualifications.length > 0 ? 3 : 0);
    const maxYears = job.experienceMaxYears ?? Math.max(minYears + 5, 15);
    const experienceScore = this.computeExperienceScore(
      resume.yearsOfExperience,
      minYears,
      maxYears
    );

    const responsibilityScore = Math.min(
      Math.round((resume.experience.length / Math.max(job.rolesResponsibilities.length, 1)) * 100),
      100
    );

    const qualificationScore = Math.round(
      (resume.skills.filter((s) => job.requiredQualifications.join(" ").toLowerCase().includes(s.toLowerCase())).length /
        Math.max(job.requiredQualifications.length, 1)) *
        100
    );

    const domainScore = resume.skills.some((s) => (job.domain || "").toLowerCase().includes(s.toLowerCase()))
      ? 85
      : 50;

    const rawOverall =
      skillScore * this.weights.skillMatch +
      experienceScore * this.weights.experience +
      responsibilityScore * this.weights.responsibilities +
      qualificationScore * this.weights.qualifications +
      domainScore * this.weights.domain;

    const overallScore = Math.round(Math.min(Math.max(rawOverall, 0), 100));

    const strengths: string[] = [];
    if (skillScore >= 70) strengths.push(`Strong skill alignment (${skillScore}%)`);
    if (experienceScore >= 70) strengths.push(`Relevant experience (${experienceScore}%)`);
    if (resume.yearsOfExperience >= 5) strengths.push(`${resume.yearsOfExperience} years of experience`);

    const gaps: string[] = [];
    const candidateSet = new Set(resume.skills.map((s) => s.toLowerCase()));
    const missing = job.requiredSkills.filter((s) => !candidateSet.has(s.toLowerCase()));
    if (missing.length) gaps.push(`Missing skills: ${missing.join(", ")}`);
    if (experienceScore < 50) gaps.push("Limited relevant experience");

    const missingRequirements: string[] = [];
    for (const req of job.requiredQualifications) {
      if (!resume.skills.some((s) => req.toLowerCase().includes(s.toLowerCase()))) {
        missingRequirements.push(req);
      }
    }

    const evidence: Array<{ text: string; score: number }> = [
      { text: `Skill match: ${skillScore}%`, score: skillScore },
      { text: `Experience: ${experienceScore}%`, score: experienceScore },
      { text: `Domain fit: ${domainScore}%`, score: domainScore },
    ];

    let recommendation = "reject";
    if (overallScore >= 70) recommendation = "hire";
    else if (overallScore >= 50) recommendation = "review";

    return {
      overallScore,
      skillScore,
      experienceScore,
      responsibilityScore,
      qualificationScore,
      domainScore,
      strengths,
      gaps,
      missingRequirements,
      evidence,
      recommendation,
    };
  }

  async generateAIInsight(
    _prompt: string,
    _context: Record<string, unknown> = {}
  ): Promise<string> {
    if (antiPromptInjection(_prompt)) {
      return "Request blocked due to security policy.";
    }

    const sanitized = sanitizeInput(_prompt).slice(0, 3000);

    try {
      const req: AICompletionRequest = {
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are an AI recruitment assistant. Provide concise insights." },
          { role: "user", content: sanitized },
        ],
        maxTokens: 300,
      };

      const response = await this.provider.complete(req);
      return validateAIOutput(z.string(), response.content);
    } catch {
      return "Unable to generate AI insight at this time.";
    }
  }
}
