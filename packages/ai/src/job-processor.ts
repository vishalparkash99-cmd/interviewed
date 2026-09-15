import { z } from "zod";
import type { AIProvider } from "./providers";
import { resumeParserSchema, evaluationReportSchema, hrReportSchema } from "./schemas";

export type ResumeParserResult = {
  name: string;
  email: string;
  phone: string;
  yearsOfExperience: number;
  skills: string[];
  experience: Array<{ title: string; company: string; summary: string }>;
  education: Array<{ degree: string; institution: string; field: string }>;
};

export type AIJobPayload = {
  type: string;
  organizationId: string;
  jobId?: string;
  candidateId?: string;
  payload: Record<string, unknown>;
};

export function createAIJob(data: AIJobPayload): AIJobPayload {
  return {
    ...data,
    type: data.type,
    organizationId: data.organizationId,
    jobId: data.jobId ?? "",
    candidateId: data.candidateId ?? "",
    payload: data.payload,
  };
}

export async function processAIJob(
  _provider: AIProvider,
  _job: AIJobPayload,
  _resumeText: string
): Promise<ResumeParserResult> {
  return {
    name: "Unknown",
    email: "",
    phone: "",
    yearsOfExperience: 0,
    skills: [],
    experience: [],
    education: [],
  };
}

export class JobProcessor {
  private provider: AIProvider;

  constructor(provider: AIProvider) {
    this.provider = provider;
  }

  async parseResume(fileContent: string): Promise<ResumeParserResult> {
    const validated = resumeParserSchema.parse({
      fileName: "resume",
      fileContent,
      mimeType: "application/pdf",
    });

    const skills = this.extractSkills(validated.fileContent);
    const yearsMatch = validated.fileContent.match(/(\d+)\+?\s*years?\s*(of\s+)?(experience|work)/i);
    const yearsOfExperience = yearsMatch ? parseInt(yearsMatch[1], 10) : 0;

    const nameMatch = validated.fileContent.match(/(?:^|\n)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/);
    const name = nameMatch ? nameMatch[1].trim() : "Unknown Candidate";

    return {
      name,
      email: "",
      phone: "",
      yearsOfExperience,
      skills,
      experience: this.extractExperience(validated.fileContent),
      education: [],
    };
  }

  private extractSkills(text: string): string[] {
    const commonSkills = [
      "JavaScript", "TypeScript", "Python", "Java", "Go", "Rust", "Node.js",
      "React", "Angular", "Vue", "PostgreSQL", "MySQL", "MongoDB", "Redis",
      "Docker", "Kubernetes", "AWS", "GCP", "Azure", "GraphQL", "REST",
      "Kafka", "RabbitMQ", "Linux", "Git", "CI/CD", "Python", "Machine Learning",
    ];

    const foundSkills = commonSkills.filter((skill) => {
      const regex = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\b`, "i");
      return regex.test(text);
    });

    return [...new Set(foundSkills)];
  }

  private extractExperience(text: string): Array<{ title: string; company: string; summary: string }> {
    const experiences: Array<{ title: string; company: string; summary: string }> = [];
    const pattern = /(?:^|\n)\s*([A-Z][a-zA-Z\s&]+)\s*[-—]\s*([A-Z][a-zA-Z\s&]+)/g;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      experiences.push({
        title: match[1].trim(),
        company: match[2].trim(),
        summary: "",
      });
    }
    return experiences.slice(0, 5);
  }
}
