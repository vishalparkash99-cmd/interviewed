import { v4 as uuidv4 } from "uuid";
import { PrismaClient } from "@interviewed/database";
import { createLogger } from "@interviewed/config/logger";
import { config } from "@interviewed/config";
import {
  createAIProvider,
  MatchingEngine,
  sanitizeInput,
  validateAIOutput,
  parsedResumeSchema,
  evaluationReportSchema,
  hrReportSchema,
  aiReportNarrativeSchema,
} from "@interviewed/ai";
import type {
  AIProvider,
  AICompletionRequest,
  EvaluationReport,
  HRReport,
  AIReportNarrative,
  JobRequirements,
  MatchResult,
  ParsedResume,
  ResumeData,
} from "@interviewed/ai";

const logger = createLogger("ai-jobs");

export type AIJob = {
  id: string;
  type: string;
  status: string;
  organizationId: string;
  jobId?: string;
  candidateId?: string;
  interviewId?: string;
  payload: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  retryCount: number;
  maxRetries: number;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

const JOB_TYPE_TO_DB: Record<string, string> = {
  "resume.parsing": "resume_parsing",
  "candidate.matching": "candidate_matching",
  "ai.evaluation": "ai_evaluation",
  "email.sending": "email_sending",
  "report.generation": "report_generation",
};

export function toDbJobType(type: string): string {
  return JOB_TYPE_TO_DB[type] ?? type.replace(/\./g, "_");
}

export function createAIJob(data: {
  type: string;
  organizationId: string;
  jobId?: string;
  candidateId?: string;
  interviewId?: string;
  payload: Record<string, unknown>;
}): AIJob {
  return {
    id: uuidv4(),
    type: data.type,
    status: "queued",
    organizationId: data.organizationId,
    jobId: data.jobId,
    candidateId: data.candidateId,
    interviewId: data.interviewId,
    payload: data.payload || {},
    retryCount: 0,
    maxRetries: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

let aiProvider: AIProvider | null = null;

function getAIProvider(): AIProvider {
  if (!aiProvider) {
    const aiConfig = config.getAiConfig();
    aiProvider = createAIProvider({
      provider: aiConfig.provider,
      apiKey:
        aiConfig.provider === "openai"
          ? aiConfig.openaiApiKey
          : aiConfig.provider === "anthropic"
            ? aiConfig.anthropicApiKey
            : aiConfig.openrouterApiKey,
      model: aiConfig.defaultModel,
      baseURL: aiConfig.openrouterBaseUrl,
    });
  }
  return aiProvider;
}

const RESUME_TEXT_LIMIT = 8000;
const ANSWER_LIMIT = 1500;
const QUESTION_LIMIT = 500;

function trimText(text: string, max: number): string {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function cleanForPrompt(text: string, max: number): string {
  return sanitizeInput(trimText(text, max)).trim();
}

async function extractResumeText(filePath: string, mimeType: string): Promise<string> {
  try {
    const { createStorageAdapter } = await import("@interviewed/storage");
    const storage = createStorageAdapter();
    const buffer = await storage.download(filePath);
    if (!buffer || buffer.length === 0) return "";

    const type = (mimeType || "").toLowerCase();
    if (type.includes("pdf")) {
      const pdfModule = (await import("pdf-parse")) as unknown as {
        PDFParse?: { new (opts: { data: Buffer }): { getText(): Promise<{ text: string }> } };
        default?: (data: Buffer) => Promise<{ text?: string }>;
      };
      const PDFParseClass = pdfModule.PDFParse;
      if (PDFParseClass) {
        const parser = new PDFParseClass({ data: buffer });
        const result = await parser.getText();
        return typeof result?.text === "string" ? result.text : "";
      }
      if (typeof pdfModule.default === "function") {
        const parsed = await pdfModule.default(buffer);
        return typeof parsed?.text === "string" ? parsed.text : "";
      }
      // Fallback: strip non-printable bytes from raw PDF content
      const rawText = buffer.toString("utf-8");
      const cleaned = rawText.replace(/[^\x20-\x7E\n\r]/g, " ");
      return cleaned.length > 100 ? cleaned : "";
    }
    if (type.includes("wordprocessingml") || type.includes("docx") || type.includes("application/octet-stream")) {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return typeof result?.value === "string" ? result.value : "";
    }
    return buffer.toString("utf-8");
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err), filePath }, "Resume text extraction failed");
    return "";
  }
}

function extractJSON<T>(content: string, fallback: T): T {
  if (!content) return fallback;
  try {
    const stripped = content.replace(/```(?:json)?/gi, "").trim();
    const match = stripped.match(/\{[\s\S]*\}/) || stripped.match(/\[[\s\S]*\]/);
    if (match) {
      return JSON.parse(match[0]) as T;
    }
  } catch {
    // fall through to direct parse
  }
  try {
    return JSON.parse(content) as T;
  } catch {
    return fallback;
  }
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  return [];
}

function asRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    const num = Number(val);
    if (Number.isFinite(num)) out[key] = num;
  }
  return out;
}

function asExperienceArray(value: unknown): ResumeData["experience"] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      title: typeof item.title === "string" ? item.title : "",
      company: typeof item.company === "string" ? item.company : "",
      summary: typeof item.summary === "string" ? item.summary : "",
    }));
}

function asResponsibilitiesArray(value: unknown): Array<{ title: string; description: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      title: typeof item.title === "string" ? item.title : "",
      description: typeof item.description === "string" ? item.description : "",
    }))
    .filter((item) => item.title.length > 0);
}

function normalizeRecommendation(value: string): string {
  const normalized = String(value || "review").toLowerCase();
  if (normalized === "hire" || normalized === "reject") return normalized;
  return "review";
}

function normalizeScore(value: unknown, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(Math.max(Math.round(num), 0), 100);
}

function normalizeEvidence(value: unknown): Array<{ text: string; score: number }> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      text: typeof item.text === "string" ? item.text : "",
      score: normalizeScore(item.score, 0),
    }))
    .filter((item) => item.text.length > 0);
}

async function completeAI(
  provider: AIProvider,
  system: string,
  user: string,
  maxTokens = 1024
): Promise<string> {
  const request: AICompletionRequest = {
    model: provider.name === "mock" ? "mock" : config.getAiConfig().defaultModel,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    maxTokens,
    temperature: 0.2,
  };
  const response = await provider.complete(request);
  return response.content || "";
}

export async function processAIJob(job: AIJob, db: PrismaClient): Promise<AIJob> {
  const startTime = Date.now();
  logger.info({ jobId: job.id, type: job.type }, "Processing AI job");

  job.status = "processing";
  job.startedAt = new Date();
  job.updatedAt = new Date();

  try {
    let result: Record<string, unknown> = {};

    switch (job.type) {
      case "resume.parsing":
        result = await processResumeParsing(job, db);
        break;
      case "candidate.matching":
        result = await processCandidateMatching(job, db);
        break;
      case "ai.evaluation":
        result = await processAIEvaluation(job, db);
        break;
      case "email.sending":
        result = await processEmailSending(job, db);
        break;
      case "report.generation":
        result = await processReportGeneration(job, db);
        break;
      default:
        logger.warn({ type: job.type }, "Unknown job type");
        result = { message: `Unknown job type: ${job.type}` };
    }

    job.status = "completed";
    job.result = result;
    job.completedAt = new Date();
    job.updatedAt = new Date();

    const duration = Date.now() - startTime;
    logger.info({ jobId: job.id, type: job.type, duration }, "AI job completed");

    await db.aIProcessingJob.update({
      where: { id: job.id },
      data: {
        status: "completed" as never,
        result: job.result as object,
        completedAt: job.completedAt,
        updatedAt: job.updatedAt,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ jobId: job.id, type: job.type, error: errorMessage }, "AI job failed");

    job.status = "failed";
    job.error = errorMessage;
    job.retryCount += 1;
    job.updatedAt = new Date();

    await db.aIProcessingJob.update({
      where: { id: job.id },
      data: {
        status: "failed" as never,
        error: errorMessage,
        retryCount: job.retryCount,
        updatedAt: job.updatedAt,
      },
    });

    throw error;
  }

  return job;
}

async function processResumeParsing(job: AIJob, db: PrismaClient): Promise<Record<string, unknown>> {
  const provider = getAIProvider();
  const candidateId = job.candidateId || (job.payload.candidateId as string);
  if (!candidateId) {
    throw new Error("resume.parsing requires candidateId");
  }

  const candidate = await db.candidate.findUnique({
    where: { id: candidateId },
    include: { resume: true },
  });
  if (!candidate) {
    throw new Error(`Candidate not found: ${candidateId}`);
  }

  const resume =
    (job.payload.resumeId as string)
      ? await db.resume.findUnique({ where: { id: job.payload.resumeId as string } })
      : candidate.resume ?? null;
  const resumeId = candidate.resumeId || (job.payload.resumeId as string) || null;

  let resumeText = "";
  if (typeof job.payload.resumeText === "string" && job.payload.resumeText.trim()) {
    resumeText = job.payload.resumeText;
  } else if (resume?.extractedText) {
    resumeText = resume.extractedText;
  } else if (resume) {
    resumeText = await extractResumeText(resume.filePath, resume.fileMimeType);
  }
  resumeText = trimText(resumeText, RESUME_TEXT_LIMIT);

  if (!resumeText.trim()) {
    if (resumeId) {
      await db.resume.update({
        where: { id: resumeId },
        data: { status: "failed", error: "No extractable text found in document" },
      });
    }
    throw new Error("No resume text available to parse");
  }

  const system =
    "Extract structured candidate information from the resume text. " +
    'Return ONLY valid JSON, no markdown, no commentary. Fields: name (string), email (string), ' +
    "phone (string), yearsOfExperience (number), skills (array of strings), " +
    "experience (array of {title, company, summary}), " +
    "education (array of {degree, institution, field}), certifications (array of strings). " +
    "Use empty strings and empty arrays when a field is unknown.";

  const content = await completeAI(provider, system, `RESUME TEXT:\n${resumeText}`, 700);
  const raw = extractJSON<Record<string, unknown>>(content, {});

  let parsed: ParsedResume = raw;
  const validation = parsedResumeSchema.safeParse(raw);
  if (validation.success) {
    parsed = validation.data;
  }

  const name = parsed.name || candidate.name;
  const email = parsed.email || candidate.email;
  const phone = parsed.phone || candidate.phone;
  const yearsOfExperience = typeof parsed.yearsOfExperience === "number" ? parsed.yearsOfExperience : candidate.yearsOfExperience;

  await db.candidate.update({
    where: { id: candidateId },
    data: {
      name,
      email,
      phone,
      yearsOfExperience,
      normalizedData: parsed as object,
      updatedAt: new Date(),
    },
  });

  if (resumeId) {
    await db.resume.update({
      where: { id: resumeId },
      data: {
        extractedText: resumeText,
        status: "parsed",
        parsedData: parsed as object,
        error: null,
      },
    });
  }

  return {
    candidateId,
    resumeId: resumeId || undefined,
    name,
    email,
    yearsOfExperience,
    skillCount: parsed.skills?.length ?? 0,
    experienceCount: parsed.experience?.length ?? 0,
  };
}

async function processCandidateMatching(job: AIJob, db: PrismaClient): Promise<Record<string, unknown>> {
  const jobId = job.jobId || (job.payload.jobId as string);
  const candidateId = job.candidateId || (job.payload.candidateId as string);
  if (!jobId || !candidateId) {
    throw new Error("candidate.matching requires jobId and candidateId");
  }

  const [jobPosting, candidate] = await Promise.all([
    db.job.findUnique({ where: { id: jobId } }),
    db.candidate.findUnique({ where: { id: candidateId } }),
  ]);

  if (!jobPosting || !candidate) {
    throw new Error("Job or candidate not found");
  }

  const requiredSkills = asStringArray(jobPosting.requiredSkills);
  const preferredSkills = asStringArray(jobPosting.preferredSkills);
  const requiredQualifications = asStringArray(jobPosting.requiredQualifications);
  const preferredQualifications = asStringArray(jobPosting.preferredQualifications);
  const rolesResponsibilities = asResponsibilitiesArray(jobPosting.rolesResponsibilities);
  const domain = jobPosting.domain || "";

  const normalized = (candidate.normalizedData ?? {}) as Record<string, unknown>;
  const candidateSkills = [...asStringArray(normalized.skills)];
  const candidateExperience = asExperienceArray(normalized.experience);

  const resume: ResumeData = {
    name: candidate.name,
    yearsOfExperience: candidate.yearsOfExperience || 0,
    skills: candidateSkills,
    experience: candidateExperience,
  };

  const rawWeights = asRecord(jobPosting.scoringWeights);
  const weightValues = {
    skillMatch: rawWeights.technical ?? 30,
    experience: rawWeights.experience ?? 25,
    responsibilities: rawWeights.responsibilities ?? 25,
    qualifications: rawWeights.qualification ?? 10,
    domain: rawWeights.domain ?? 10,
  };
  const weightTotal = Math.max(
    weightValues.skillMatch + weightValues.experience + weightValues.responsibilities + weightValues.qualifications + weightValues.domain,
    1
  );
  const weights = {
    skillMatch: weightValues.skillMatch / weightTotal,
    experience: weightValues.experience / weightTotal,
    responsibilities: weightValues.responsibilities / weightTotal,
    qualifications: weightValues.qualifications / weightTotal,
    domain: weightValues.domain / weightTotal,
  };

  const engine = new MatchingEngine(getAIProvider(), weights);
  const requirements: JobRequirements = {
    requiredSkills,
    preferredSkills,
    requiredQualifications,
    preferredQualifications,
    rolesResponsibilities,
    domain,
    experienceMinYears: jobPosting.experienceMinYears || 0,
    experienceMaxYears: jobPosting.experienceMaxYears || 0,
  };

  const result: MatchResult = await engine.matchCandidate(resume, requirements);

  const candidateSkillSet = new Set(candidateSkills.map((skill) => skill.toLowerCase()));
  const matchedSkills = requiredSkills.filter((skill) => candidateSkillSet.has(skill.toLowerCase()));
  const missingSkills = requiredSkills.filter((skill) => !candidateSkillSet.has(skill.toLowerCase()));

  const strengths = [...result.strengths];
  if (matchedSkills.length > 0) {
    strengths.push(`Skills matched: ${matchedSkills.join(", ")}`);
  }
  if (candidate.yearsOfExperience > 0) {
    strengths.push(`${candidate.yearsOfExperience} years of total experience`);
  }

  const gaps = [...result.gaps];
  if (missingSkills.length > 0) {
    gaps.push(`Missing required skills: ${missingSkills.join(", ")}`);
  }

  const evidence = [
    ...normalizeEvidence(result.evidence),
    { text: `Required skills met: ${matchedSkills.length}/${requiredSkills.length || 0}`, score: result.skillScore },
    { text: `Relevant experience: ${candidate.yearsOfExperience} years`, score: result.experienceScore },
  ];

  const aiDecision = {
    matchedSkills,
    missingSkills,
    scores: {
      overall: result.overallScore,
      skill: result.skillScore,
      experience: result.experienceScore,
      responsibility: result.responsibilityScore,
      qualification: result.qualificationScore,
      domain: result.domainScore,
    },
    evaluatedAt: new Date().toISOString(),
  };

  const match = await db.candidateJobMatch.upsert({
    where: { candidateId_jobId: { candidateId, jobId } },
    create: {
      candidateId,
      jobId,
      overallScore: result.overallScore,
      skillScore: result.skillScore,
      experienceScore: result.experienceScore,
      responsibilityScore: result.responsibilityScore,
      qualificationScore: result.qualificationScore,
      domainScore: result.domainScore,
      strengths: strengths as object,
      gaps: gaps as object,
      missingRequirements: result.missingRequirements as object,
      evidence: evidence as object,
      recommendation: normalizeRecommendation(result.recommendation),
      aiDecision: aiDecision as object,
      processingId: job.id,
    },
    update: {
      overallScore: result.overallScore,
      skillScore: result.skillScore,
      experienceScore: result.experienceScore,
      responsibilityScore: result.responsibilityScore,
      qualificationScore: result.qualificationScore,
      domainScore: result.domainScore,
      strengths: strengths as object,
      gaps: gaps as object,
      missingRequirements: result.missingRequirements as object,
      evidence: evidence as object,
      recommendation: normalizeRecommendation(result.recommendation),
      aiDecision: aiDecision as object,
      processingId: job.id,
    },
  });

  return {
    matchId: match.id,
    overallScore: result.overallScore,
    skillScore: result.skillScore,
    experienceScore: result.experienceScore,
    recommendation: result.recommendation,
    matchedSkills,
    missingSkills,
  };
}

async function processAIEvaluation(job: AIJob, db: PrismaClient): Promise<Record<string, unknown>> {
  const provider = getAIProvider();
  const interviewId = job.interviewId || (job.payload.interviewId as string);
  if (!interviewId) {
    throw new Error("ai.evaluation requires interviewId");
  }

  const interview = await db.interview.findUnique({
    where: { id: interviewId },
    include: {
      questions: { orderBy: { sequence: "asc" } },
      answers: true,
      transcriptSegments: { orderBy: { timestamp: "asc" } },
    },
  });
  if (!interview) {
    throw new Error(`Interview not found: ${interviewId}`);
  }

  const [jobPosting, candidate] = await Promise.all([
    db.job.findUnique({ where: { id: interview.jobId } }),
    db.candidate.findUnique({ where: { id: interview.candidateId } }),
  ]);

  const requiredSkills = asStringArray(jobPosting?.requiredSkills);
  const responsibilities = asResponsibilitiesArray(jobPosting?.rolesResponsibilities);

  const questionAnswerPairs = interview.questions
    .map((question) => {
      const answer = interview.answers.find((item) => item.questionId === question.id);
      return `Q (${question.type || "question"}): ${cleanForPrompt(question.question, QUESTION_LIMIT)}\nA: ${cleanForPrompt(answer?.answer || "No answer", ANSWER_LIMIT)}`;
    })
    .join("\n\n");

  const transcript = interview.transcriptSegments
    .slice(-15)
    .map((segment) => `${segment.speaker}: ${cleanForPrompt(segment.text, 300)}`)
    .join("\n");

  const system =
    "You are a senior technical interviewer. Evaluate the candidate's responses against the job requirements. " +
    "Return ONLY valid JSON, no markdown, no commentary. Fields: " +
    "overallScore, technicalScore, roleCompetency, problemSolving, practicalExp, communication, " +
    "systemDesign, resumeValidation (each an integer 0-100), " +
    "strengths (string[]), weaknesses (string[]), skillGaps (string[]), " +
    "evidence (array of {text, score}), concerns (string[]), " +
    "recommendation (exactly \"hire\", \"review\", or \"reject\"), aiSummary (string).";

  const roleContext = [
    `JOB: ${jobPosting?.title || "Unknown"}`,
    `Required skills: ${requiredSkills.join(", ") || "none"}`,
  ];
  if (responsibilities.length > 0) {
    roleContext.push(`Key responsibilities: ${responsibilities.map((item) => item.title).join(", ")}`);
  }
  const user = [
    roleContext.join("\n"),
    `\nQ&A:\n${trimText(questionAnswerPairs, 12000) || "No answers recorded"}`,
    `\nTRANSCRIPT EXCERPT:\n${trimText(transcript, 4000) || "No transcript available"}`,
  ].join("\n");

  const content = await completeAI(provider, system, user, 1000);
  const raw = extractJSON<Record<string, unknown>>(content, {});

  const defaults: EvaluationReport = {
    interviewId,
    overallScore: 65,
    technicalScore: 65,
    roleCompetency: 65,
    problemSolving: 65,
    practicalExp: 65,
    communication: 65,
    systemDesign: 65,
    resumeValidation: 65,
    strengths: [],
    weaknesses: [],
    skillGaps: [],
    evidence: [],
    concerns: [],
    recommendation: "review",
    aiSummary: "Evaluation completed.",
  };

  const merged = {
    ...defaults,
    ...raw,
    interviewId,
    overallScore: normalizeScore(raw.overallScore, defaults.overallScore),
    technicalScore: normalizeScore(raw.technicalScore, defaults.technicalScore),
    roleCompetency: normalizeScore(raw.roleCompetency, defaults.roleCompetency),
    problemSolving: normalizeScore(raw.problemSolving, defaults.problemSolving),
    practicalExp: normalizeScore(raw.practicalExp, defaults.practicalExp),
    communication: normalizeScore(raw.communication, defaults.communication),
    systemDesign: normalizeScore(raw.systemDesign, defaults.systemDesign),
    resumeValidation: normalizeScore(raw.resumeValidation, defaults.resumeValidation),
    strengths: asStringArray(raw.strengths),
    weaknesses: asStringArray(raw.weaknesses),
    skillGaps: asStringArray(raw.skillGaps),
    concerns: asStringArray(raw.concerns),
    evidence: normalizeEvidence(raw.evidence),
    recommendation: normalizeRecommendation(typeof raw.recommendation === "string" ? raw.recommendation : "review"),
    aiSummary: typeof raw.aiSummary === "string" ? raw.aiSummary : defaults.aiSummary,
  };
  const evaluation = validateAIOutput(evaluationReportSchema, merged);

  const evidence = normalizeEvidence(evaluation.evidence);
  if (evidence.length === 0 && transcript) {
    evidence.push({ text: "Responses and transcript reviewed in full", score: evaluation.overallScore });
  }

  const record = await db.interviewEvaluation.upsert({
    where: { interviewId },
    create: {
      interviewId,
      overallScore: evaluation.overallScore,
      technicalScore: evaluation.technicalScore,
      roleCompetency: evaluation.roleCompetency,
      problemSolving: evaluation.problemSolving,
      practicalExp: evaluation.practicalExp,
      communication: evaluation.communication,
      systemDesign: evaluation.systemDesign,
      resumeValidation: evaluation.resumeValidation,
      strengths: evaluation.strengths as object,
      weaknesses: evaluation.weaknesses as object,
      skillGaps: evaluation.skillGaps as object,
      evidence: evidence as object,
      concerns: evaluation.concerns as object,
      recommendation: evaluation.recommendation,
      aiSummary: evaluation.aiSummary as string | undefined,
      processingId: job.id,
    },
    update: {
      overallScore: evaluation.overallScore,
      technicalScore: evaluation.technicalScore,
      roleCompetency: evaluation.roleCompetency,
      problemSolving: evaluation.problemSolving,
      practicalExp: evaluation.practicalExp,
      communication: evaluation.communication,
      systemDesign: evaluation.systemDesign,
      resumeValidation: evaluation.resumeValidation,
      strengths: evaluation.strengths as object,
      weaknesses: evaluation.weaknesses as object,
      skillGaps: evaluation.skillGaps as object,
      evidence: evidence as object,
      concerns: evaluation.concerns as object,
      recommendation: evaluation.recommendation,
      aiSummary: evaluation.aiSummary as string | undefined,
      processingId: job.id,
    },
  });

  return {
    evaluationId: record.id,
    overallScore: record.overallScore,
    recommendation: record.recommendation,
  };
}

async function processReportGeneration(job: AIJob, db: PrismaClient): Promise<Record<string, unknown>> {
  const provider = getAIProvider();
  const interviewId = job.interviewId || (job.payload.interviewId as string);
  if (!interviewId) {
    throw new Error("report.generation requires interviewId");
  }

  const interview = await db.interview.findUnique({
    where: { id: interviewId },
    include: {
      evaluation: true,
      questions: { orderBy: { sequence: "asc" } },
      answers: true,
    },
  });
  if (!interview) {
    throw new Error(`Interview not found: ${interviewId}`);
  }

  const [candidate, jobPosting, match] = await Promise.all([
    db.candidate.findUnique({ where: { id: interview.candidateId } }),
    db.job.findUnique({ where: { id: interview.jobId } }),
    db.candidateJobMatch.findUnique({
      where: { candidateId_jobId: { candidateId: interview.candidateId, jobId: interview.jobId } },
    }),
  ]);

  const evaluation = interview.evaluation;
  const competencyScores: Record<string, number> = {
    overall: evaluation?.overallScore ?? 0,
    technical: evaluation?.technicalScore ?? 0,
    roleCompetency: evaluation?.roleCompetency ?? 0,
    problemSolving: evaluation?.problemSolving ?? 0,
    practicalExp: evaluation?.practicalExp ?? 0,
    communication: evaluation?.communication ?? 0,
    systemDesign: evaluation?.systemDesign ?? 0,
    resumeValidation: evaluation?.resumeValidation ?? 0,
  };

  const resumeMatchScore = Math.round(match?.overallScore ?? competencyScores.overall);
  const interviewScore = Math.round(evaluation?.overallScore ?? 0);

  const keyQa = interview.questions.slice(0, 5).map((question) => {
    const answer = interview.answers.find((item) => item.questionId === question.id);
    return {
      question: cleanForPrompt(question.question, QUESTION_LIMIT),
      answer: cleanForPrompt(answer?.answer || "No answer", ANSWER_LIMIT),
    };
  });

  const system =
    "You are an HR analyst writing a confidential candidate evaluation report. " +
    "Return ONLY valid JSON, no markdown, no commentary. Fields: interviewSummary (string), " +
    "strengths (string[]), weaknesses (string[]), skillGaps (string[]), concerns (string[]), " +
    'aiRecommendation (exactly "hire", "review", or "reject").';

  const user = [
    `CANDIDATE: ${candidate?.name || "Unknown"} (${candidate?.email || "no email"})`,
    `JOB: ${jobPosting?.title || "Unknown"}`,
    `RESUME MATCH SCORE: ${resumeMatchScore}/100`,
    `INTERVIEW SCORE: ${interviewScore}/100`,
    `COMPETENCY SCORES: ${JSON.stringify(competencyScores)}`,
    `KEY Q&A:\n${keyQa.map((item) => `Q: ${item.question}\nA: ${item.answer}`).join("\n") || "No Q&A available"}`,
  ].join("\n");

  const content = await completeAI(provider, system, user, 1000);
  const raw = extractJSON<Record<string, unknown>>(content, {});

  const narrativeDefaults: AIReportNarrative = {
    interviewSummary: "Report generated from interview data.",
    strengths: [],
    weaknesses: [],
    skillGaps: [],
    concerns: [],
    aiRecommendation: "review",
  };
  const narrativeValidation = aiReportNarrativeSchema.safeParse({
    interviewSummary: typeof raw.interviewSummary === "string" ? raw.interviewSummary : narrativeDefaults.interviewSummary,
    strengths: asStringArray(raw.strengths),
    weaknesses: asStringArray(raw.weaknesses),
    skillGaps: asStringArray(raw.skillGaps),
    concerns: asStringArray(raw.concerns),
    aiRecommendation: normalizeRecommendation(typeof raw.aiRecommendation === "string" ? raw.aiRecommendation : "review"),
  });
  const narrative = narrativeValidation.success ? narrativeValidation.data : narrativeDefaults;

  const reportData: HRReport = {
    interviewId,
    candidateName: candidate?.name || "Unknown",
    candidateEmail: candidate?.email || "",
    jobTitle: jobPosting?.title || "Unknown",
    resumeMatchScore,
    interviewScore,
    competencyScores,
    strengths: narrative.strengths,
    weaknesses: narrative.weaknesses,
    skillGaps: narrative.skillGaps,
    evidence: normalizeEvidence(evaluation?.evidence),
    keyQa,
    aiRecommendation: narrative.aiRecommendation,
  };

  const reportValidation = hrReportSchema.safeParse(reportData);
  const safeReport = reportValidation.success ? reportValidation.data : reportData;

  const record = await db.interviewReport.upsert({
    where: { interviewId },
    create: {
      interviewId,
      candidateInfo: {
        name: candidate?.name,
        email: candidate?.email,
        phone: candidate?.phone,
        yearsOfExperience: candidate?.yearsOfExperience,
      } as object,
      jobInfo: {
        title: jobPosting?.title,
        department: jobPosting?.department,
        location: jobPosting?.location,
      } as object,
      resumeMatchScore: safeReport.resumeMatchScore,
      interviewScore: safeReport.interviewScore,
      competencyScores: safeReport.competencyScores as object,
      interviewSummary: narrative.interviewSummary,
      strengths: safeReport.strengths as object,
      weaknesses: safeReport.weaknesses as object,
      skillGaps: safeReport.skillGaps as object,
      evidence: safeReport.evidence as object,
      keyQa: safeReport.keyQa as object,
      concerns: narrative.concerns as object,
      aiRecommendation: safeReport.aiRecommendation,
      hrDecision: {} as object,
      status: "draft",
      createdBy: "system",
    },
    update: {
      candidateInfo: {
        name: candidate?.name,
        email: candidate?.email,
        phone: candidate?.phone,
        yearsOfExperience: candidate?.yearsOfExperience,
      } as object,
      jobInfo: {
        title: jobPosting?.title,
        department: jobPosting?.department,
        location: jobPosting?.location,
      } as object,
      resumeMatchScore: safeReport.resumeMatchScore,
      interviewScore: safeReport.interviewScore,
      competencyScores: safeReport.competencyScores as object,
      interviewSummary: narrative.interviewSummary,
      strengths: safeReport.strengths as object,
      weaknesses: safeReport.weaknesses as object,
      skillGaps: safeReport.skillGaps as object,
      evidence: safeReport.evidence as object,
      keyQa: safeReport.keyQa as object,
      concerns: narrative.concerns as object,
      aiRecommendation: safeReport.aiRecommendation,
    },
  });

  return {
    reportId: record.id,
    resumeMatchScore: record.resumeMatchScore,
    interviewScore: record.interviewScore,
    aiRecommendation: record.aiRecommendation,
  };
}

async function processEmailSending(job: AIJob, db: PrismaClient): Promise<Record<string, unknown>> {
  const payload = job.payload || {};
  const to = (payload.to as string) || (payload.recipient as string) || "";
  const subject = (payload.subject as string) || "";
  const body = (payload.body as string) || (payload.html as string) || "";
  const emailId = payload.emailId as string | undefined;

  if (!to || !subject) {
    throw new Error("email.sending requires to and subject");
  }

  const emailConfig = config.getEmailConfig();
  const fromEmail = (payload.from as string) || emailConfig.fromEmail;

  const smtpConfigured = Boolean(emailConfig.smtpHost);

  if (smtpConfigured) {
    try {
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.default.createTransport({
        host: emailConfig.smtpHost,
        port: emailConfig.smtpPort || 587,
        secure: (emailConfig.smtpPort || 587) === 465,
        ...(emailConfig.smtpUser ? { auth: { user: emailConfig.smtpUser, pass: emailConfig.smtpPassword } } : {}),
      });
      const info = await transporter.sendMail({
        from: fromEmail,
        to,
        subject,
        text: body,
      });

      if (emailId) {
        await db.email.update({
          where: { id: emailId },
          data: { status: "sent", sentAt: new Date(), errorMessage: null, errorCode: null },
        });
      }

      logger.info({ jobId: job.id, to, messageId: (info as { messageId?: string }).messageId }, "Email sent via SMTP");
      return {
        success: true,
        provider: "smtp",
        recipient: to,
        subject,
        messageId: (info as { messageId?: string }).messageId,
        sentAt: new Date().toISOString(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (emailId) {
        await db.email.update({
          where: { id: emailId },
          data: { status: "failed", errorMessage: message, errorCode: "smtp_error" },
        });
      }
      throw error;
    }
  }

  logger.info({ jobId: job.id, to }, "Email sending (mock mode - logged only)");
  if (emailId) {
    await db.email.update({
      where: { id: emailId },
      data: { status: "sent", sentAt: new Date(), errorMessage: null, errorCode: null },
    });
  }
  return {
    success: true,
    provider: "mock",
    recipient: to,
    subject,
    sentAt: new Date().toISOString(),
  };
}