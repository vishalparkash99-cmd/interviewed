export type WorkerConfig = {
  pollIntervalMs: number;
  maxConcurrentJobs: number;
  retryAttempts: number;
  retryDelayMs: number;
  backoffMultiplier: number;
};

export const defaultWorkerConfig: WorkerConfig = {
  pollIntervalMs: 5000,
  maxConcurrentJobs: 5,
  retryAttempts: 3,
  retryDelayMs: 1000,
  backoffMultiplier: 2,
};

export function createWorkerConfig(overrides?: Partial<WorkerConfig>): WorkerConfig {
  return { ...defaultWorkerConfig, ...overrides };
}
