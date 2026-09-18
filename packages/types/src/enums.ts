export enum UserRole {
  SuperAdmin = "super_admin",
  OrgAdmin = "org_admin",
  Recruiter = "recruiter",
  Candidate = "candidate",
}

export enum JobStatus {
  Draft = "draft",
  Active = "active",
  Closed = "closed",
  Paused = "paused",
}

export enum CandidateStatus {
  Active = "active",
  Screened = "screened",
  Shortlisted = "shortlisted",
  Rejected = "rejected",
  Hired = "hired",
  Archived = "archived",
}

export enum MatchStatus {
  Pending = "pending",
  Approved = "approved",
  Rejected = "rejected",
}

export enum InterviewStatus {
  Scheduled = "scheduled",
  InProgress = "in_progress",
  Completed = "completed",
  Cancelled = "cancelled",
}

export enum EmailType {
  Invitation = "invitation",
  Reminder = "reminder",
  Result = "result",
  Welcome = "welcome",
  PasswordReset = "password_reset",
  Reschedule = "reschedule",
  Cancellation = "cancellation",
  Completion = "completion",
}

export enum EmailStatus {
  Pending = "pending",
  Sent = "sent",
  Failed = "failed",
}

export enum AIJobType {
  ResumeParsing = "resume.parsing",
  CandidateMatching = "candidate.matching",
  AIEvaluation = "ai.evaluation",
  EmailSending = "email.sending",
  ReportGeneration = "report.generation",
}

export enum AIJobStatus {
  Queued = "queued",
  Processing = "processing",
  Completed = "completed",
  Failed = "failed",
}
