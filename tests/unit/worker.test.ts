import { toDbJobType, createAIJob } from "../../apps/worker/src/ai-jobs";

describe("Worker: toDbJobType", () => {
  it("converts dotted job type to underscore format", () => {
    expect(toDbJobType("resume.parsing")).toBe("resume_parsing");
    expect(toDbJobType("candidate.matching")).toBe("candidate_matching");
    expect(toDbJobType("ai.evaluation")).toBe("ai_evaluation");
    expect(toDbJobType("email.sending")).toBe("email_sending");
    expect(toDbJobType("report.generation")).toBe("report_generation");
  });

  it("falls back to underscore replacement for unknown types", () => {
    expect(toDbJobType("custom.job.type")).toBe("custom_job_type");
  });

  it("handles types already in underscore format", () => {
    expect(toDbJobType("already_underscore")).toBe("already_underscore");
  });
});

describe("Worker: createAIJob", () => {
  it("creates a job with all required fields", () => {
    const job = createAIJob({
      type: "resume.parsing",
      organizationId: "org-123",
      payload: { resumeId: "r1" },
    });

    expect(job.id).toBeDefined();
    expect(job.type).toBe("resume.parsing");
    expect(job.status).toBe("queued");
    expect(job.organizationId).toBe("org-123");
    expect(job.payload).toEqual({ resumeId: "r1" });
    expect(job.retryCount).toBe(0);
    expect(job.maxRetries).toBe(3);
    expect(job.createdAt).toBeInstanceOf(Date);
  });

  it("includes optional refs when provided", () => {
    const job = createAIJob({
      type: "candidate.matching",
      organizationId: "org-1",
      jobId: "job-1",
      candidateId: "cand-1",
      payload: {},
    });

    expect(job.jobId).toBe("job-1");
    expect(job.candidateId).toBe("cand-1");
  });

  it("defaults payload to empty object when undefined", () => {
    const job = createAIJob({
      type: "ai.evaluation",
      organizationId: "org-1",
      payload: undefined as any,
    });

    expect(job.payload).toEqual({});
  });
});
