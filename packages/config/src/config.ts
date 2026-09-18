import { validateEnv, type Env } from "./env";

let cachedEnv: Env | null = null;

function getEnv(): Env {
  if (!cachedEnv) {
    cachedEnv = validateEnv();
  }
  return cachedEnv;
}

export function refreshConfig(): void {
  cachedEnv = null;
}

export const config = {
  get: <K extends keyof Env>(key: K): Env[K] => {
    return getEnv()[key];
  },

  getJwtSecret: (): string => {
    return getEnv().JWT_SECRET;
  },

  getRefreshJwtSecret: (): string => {
    return getEnv().JWT_REFRESH_SECRET;
  },

  getRateLimit: (): { windowMs: number; max: number } => {
    return {
      windowMs: getEnv().RATE_LIMIT_WINDOW_MS,
      max: getEnv().RATE_LIMIT_MAX,
    };
  },

  getLogLevel: (): string => {
    return getEnv().LOG_LEVEL;
  },

  getLogFormat: (): string => {
    return getEnv().LOG_FORMAT;
  },

  getDatabaseUrl: (): string => {
    return getEnv().DATABASE_URL;
  },

  getRedisUrl: (): string => {
    return getEnv().REDIS_URL;
  },

  getRabbitMqUrl: (): string => {
    return getEnv().RABBITMQ_URL;
  },

  getRabbitMqQueues: () => ({
    resumeParsing: getEnv().RABBITMQ_QUEUE_RESUME_PARSING,
    matching: getEnv().RABBITMQ_QUEUE_MATCHING,
    aiEvaluation: getEnv().RABBITMQ_QUEUE_AI_EVALUATION,
    email: getEnv().RABBITMQ_QUEUE_EMAIL,
    report: getEnv().RABBITMQ_QUEUE_REPORT,
  }),

  getAiConfig: () => ({
    provider: getEnv().AI_PROVIDER,
    openaiApiKey: getEnv().OPENAI_API_KEY,
    anthropicApiKey: getEnv().ANTHROPIC_API_KEY,
    openrouterApiKey: getEnv().OPENROUTER_API_KEY,
    openrouterBaseUrl: getEnv().OPENROUTER_BASE_URL,
    defaultModel: getEnv().DEFAULT_AI_MODEL,
    embeddingModel: getEnv().EMBEDDING_MODEL,
    embeddingDimension: getEnv().EMBEDDING_DIMENSION,
  }),

  getStorageConfig: () => ({
    provider: getEnv().STORAGE_PROVIDER,
    bucket: getEnv().STORAGE_BUCKET,
    endpoint: getEnv().S3_ENDPOINT,
    accessKey: getEnv().S3_ACCESS_KEY,
    secretKey: getEnv().S3_SECRET_KEY,
    region: getEnv().S3_REGION,
    forcePathStyle: getEnv().S3_FORCE_PATH_STYLE,
  }),

  getEmailConfig: () => ({
    provider: getEnv().EMAIL_PROVIDER,
    resendApiKey: getEnv().RESEND_API_KEY,
    smtpHost: getEnv().SMTP_HOST,
    smtpPort: getEnv().SMTP_PORT,
    smtpUser: getEnv().SMTP_USER,
    smtpPassword: getEnv().SMTP_PASSWORD,
    fromEmail: getEnv().FROM_EMAIL,
    fromName: getEnv().FROM_NAME,
  }),

  getInterviewConfig: () => ({
    defaultDuration: getEnv().INTERVIEW_DEFAULT_DURATION,
    defaultDifficulty: getEnv().INTERVIEW_DEFAULT_DIFFICULTY,
    linkExpiryHours: getEnv().INTERVIEW_LINK_EXPIRY_HOURS,
    recordingEnabled: getEnv().INTERVIEW_RECORDING_ENABLED,
  }),

  getNodeEnv: (): string => {
    return getEnv().NODE_ENV;
  },

  getApiPort: (): number => {
    return getEnv().API_PORT;
  },

  getWebPort: (): number => {
    return getEnv().WEB_PORT;
  },

  getWorkerPort: (): number => {
    return getEnv().WORKER_PORT;
  },

  getMaxFileSizeBytes: (): number => {
    return getEnv().MAX_FILE_SIZE_MB * 1024 * 1024;
  },

  getAllowedFileTypes: (): string[] => {
    return getEnv().ALLOWED_FILE_TYPES.split(",").map((t) => t.trim());
  },
};
