import { v4 as uuidv4 } from "uuid";
import type { UserRole } from "@interviewed/types";

export type AIJob = {
  id: string;
  type: string;
  status: string;
  organizationId: string;
  jobId?: string;
  candidateId?: string;
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

export function createAIJob(data: {
  type: string;
  organizationId: string;
  jobId?: string;
  candidateId?: string;
  payload: Record<string, unknown>;
}): AIJob {
  return {
    id: uuidv4(),
    type: data.type,
    status: "queued",
    organizationId: data.organizationId,
    jobId: data.jobId,
    candidateId: data.candidateId,
    payload: data.payload,
    retryCount: 0,
    maxRetries: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export async function processAIJob(job: AIJob, _db?: unknown): Promise<AIJob> {
  job.status = "completed";
  job.completedAt = new Date();
  job.updatedAt = new Date();
  return job;
}
