export { UserRole, JobStatus, CandidateStatus, MatchStatus, InterviewStatus, EmailType, EmailStatus, AIJobType, AIJobStatus } from "./enums";

export interface DiagnosticScore {
  technicalAccuracy: number; // 0-100
  communicationClarity: number; // 0-100
  problemSolvingStructure: number; // 0-100
  pacingAndConciseness: number; // 0-100
  overallScore: number; // 0-100
}

export interface QuestionFeedback {
  questionId: string;
  scores: DiagnosticScore;
  strengths: string[];
  keyOmissions: string[];
  improvedAnswer: string; // Top 1% sample response
  actionableTips: string[];
}

export interface TailoredInterviewPromptInput {
  resumeText: string;
  jobDescription: string;
  roleTitle: string;
  experienceLevel: string;
}

export type ScoringWeights = {
  technical: number;
  experience: number;
  responsibilities: number;
  qualification: number;
  domain: number;
};

export type User = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  organizationId?: string;
};

export type Organization = {
  id: string;
  name: string;
  slug: string;
  industry?: string;
  timezone: string;
  settings: Record<string, unknown>;
};

export type Job = {
  id: string;
  title: string;
  slug: string;
  department?: string;
  location?: string;
  employmentType: string;
  experienceMinYears: number;
  experienceMaxYears: number;
  description: string;
  requiredSkills: string[];
  requiredQualifications: string[];
  preferredSkills: string[];
  preferredQualifications: string[];
  domain?: string;
  interviewDuration: number;
  interviewDifficulty: string;
  shortlistCount: number;
  minimumScreeningScore: number;
  scoringWeights: ScoringWeights;
  status: string;
  organizationId: string;
  ownerId: string;
};

export type Candidate = {
  id: string;
  externalId: string;
  name: string;
  email: string;
  phone?: string;
  yearsOfExperience: number;
  skills: string[];
  status: string;
  organizationId: string;
  currentJobTitle?: string;
  currentCompany?: string;
  normalizedData: Record<string, unknown>;
};

export type Resume = {
  id: string;
  fileName: string;
  fileMimeType: string;
  fileSize: number;
  filePath: string;
  extractedText?: string;
  parsedData: Record<string, unknown>;
  status: string;
};

export type CandidateJobMatch = {
  id: string;
  candidateId: string;
  jobId: string;
  overallScore: number;
  skillScore: number;
  experienceScore: number;
  responsibilityScore: number;
  qualificationScore: number;
  domainScore: number;
  strengths: string[];
  gaps: string[];
  missingRequirements: string[];
  recommendation: string;
  status: string;
};

export type Interview = {
  id: string;
  candidateId: string;
  jobId: string;
  interviewKey: string;
  secureToken: string;
  status: string;
  plan: unknown[];
  totalDuration: number;
  startedAt?: Date;
  endedAt?: Date;
  transcript?: string;
};

export type InterviewQuestion = {
  id: string;
  interviewId: string;
  section: string;
  question: string;
  type: string;
  difficulty: string;
  isFollowUp: boolean;
  sequence: number;
};

export type InterviewAnswer = {
  id: string;
  interviewId: string;
  questionId: string;
  answer: string;
  durationSeconds: number;
  confidence: number;
};

export type TranscriptSegment = {
  id: string;
  interviewId: string;
  speaker: string;
  timestamp: Date;
  text: string;
  segmentType: string;
  competency?: string;
};

export type InterviewEvaluation = {
  id: string;
  interviewId: string;
  overallScore: number;
  technicalScore: number;
  roleCompetency: number;
  problemSolving: number;
  practicalExp: number;
  communication: number;
  systemDesign: number;
  resumeValidation: number;
  strengths: string[];
  weaknesses: string[];
  skillGaps: string[];
  recommendation: string;
  aiSummary?: string;
  status: string;
};

export type InterviewReport = {
  id: string;
  interviewId: string;
  candidateInfo: Record<string, unknown>;
  jobInfo: Record<string, unknown>;
  resumeMatchScore: number;
  interviewScore: number;
  competencyScores: Record<string, number>;
  interviewSummary: string;
  strengths: string[];
  weaknesses: string[];
  skillGaps: string[];
  evidence: unknown[];
  keyQa: unknown[];
  aiRecommendation: string;
  hrDecision: Record<string, unknown>;
  status: string;
};

export type Email = {
  id: string;
  type: string;
  recipient: string;
  recipientName?: string;
  subject: string;
  body: string;
  template?: string;
  status: string;
  sentAt?: Date;
};

export type AuditLogEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorId: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
};
