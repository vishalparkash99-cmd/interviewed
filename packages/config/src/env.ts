import { config as loadEnv } from "dotenv";
import path from "path";
import { z } from "zod";

const candidates = [
  path.resolve(__dirname, "../../../.env"),
  path.resolve(__dirname, "../../.env"),
  path.resolve(process.cwd(), ".env"),
];

let loaded = false;
for (const candidate of candidates) {
  const result = loadEnv({ path: candidate, quiet: true });
  if (!result.error) {
    loaded = true;
    break;
  }
}
if (!loaded) {
  loadEnv();
}

export type Env = {
  DATABASE_URL: string;
  DATABASE_POOL_MIN: number;
  DATABASE_POOL_MAX: number;
  REDIS_URL: string;
  RABBITMQ_URL: string;
  RABBITMQ_QUEUE_RESUME_PARSING: string;
  RABBITMQ_QUEUE_MATCHING: string;
  RABBITMQ_QUEUE_AI_EVALUATION: string;
  RABBITMQ_QUEUE_EMAIL: string;
  RABBITMQ_QUEUE_REPORT: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  JWT_REFRESH_SECRET: string;
  JWT_REFRESH_EXPIRES_IN: string;
  AI_PROVIDER: string;
  OPENAI_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  OPENROUTER_API_KEY: string;
  OPENROUTER_BASE_URL: string;
  DEFAULT_AI_MODEL: string;
  EMBEDDING_MODEL: string;
  EMBEDDING_DIMENSION: number;
  STORAGE_PROVIDER: string;
  STORAGE_BUCKET: string;
  S3_ENDPOINT: string;
  S3_ACCESS_KEY: string;
  S3_SECRET_KEY: string;
  S3_REGION: string;
  S3_FORCE_PATH_STYLE: boolean;
  EMAIL_PROVIDER: string;
  RESEND_API_KEY: string;
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_USER: string;
  SMTP_PASSWORD: string;
  FROM_EMAIL: string;
  FROM_NAME: string;
  NODE_ENV: string;
  API_PORT: number;
  WEB_PORT: number;
  WORKER_PORT: number;
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX: number;
  MAX_FILE_SIZE_MB: number;
  ALLOWED_FILE_TYPES: string;
  INTERVIEW_DEFAULT_DURATION: number;
  INTERVIEW_DEFAULT_DIFFICULTY: string;
  INTERVIEW_LINK_EXPIRY_HOURS: number;
  INTERVIEW_RECORDING_ENABLED: boolean;
  LOG_LEVEL: string;
  LOG_FORMAT: string;
  SENTRY_DSN: string;
  DATA_RETENTION_CANDIDATE_DATA_DAYS: number;
  DATA_RETENTION_INTERVIEW_RECORDINGS_DAYS: number;
};

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_MIN: z.coerce.number().min(1).default(2),
  DATABASE_POOL_MAX: z.coerce.number().min(1).default(20),
  REDIS_URL: z.string().min(1),
  RABBITMQ_URL: z.string().min(1),
  RABBITMQ_QUEUE_RESUME_PARSING: z.string().default("resume.parsing"),
  RABBITMQ_QUEUE_MATCHING: z.string().default("candidate.matching"),
  RABBITMQ_QUEUE_AI_EVALUATION: z.string().default("ai.evaluation"),
  RABBITMQ_QUEUE_EMAIL: z.string().default("email.sending"),
  RABBITMQ_QUEUE_REPORT: z.string().default("report.generation"),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  AI_PROVIDER: z.enum(["openai", "anthropic", "openrouter", "mock"]).default("mock"),
  OPENAI_API_KEY: z.string().default(""),
  ANTHROPIC_API_KEY: z.string().default(""),
  OPENROUTER_API_KEY: z.string().default(""),
  OPENROUTER_BASE_URL: z.string().default("https://openrouter.ai/api/v1"),
  DEFAULT_AI_MODEL: z.string().default("gpt-4o"),
  EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  EMBEDDING_DIMENSION: z.coerce.number().default(1536),
  STORAGE_PROVIDER: z.enum(["s3", "local"]).default("local"),
  STORAGE_BUCKET: z.string().default("interviewed-uploads"),
  S3_ENDPOINT: z.string().default("http://localhost:9000"),
  S3_ACCESS_KEY: z.string().default("minioadmin"),
  S3_SECRET_KEY: z.string().default("minioadmin"),
  S3_REGION: z.string().default("us-east-1"),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
  EMAIL_PROVIDER: z.enum(["resend", "smtp", "mock"]).default("mock"),
  RESEND_API_KEY: z.string().default(""),
  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().default(""),
  SMTP_PASSWORD: z.string().default(""),
  FROM_EMAIL: z.string().email().default("noreply@interviewed.ai"),
  FROM_NAME: z.string().default("Interviewed"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  API_PORT: z.coerce.number().default(() => Number(process.env.PORT) || 3001),
  WEB_PORT: z.coerce.number().default(3000),
  WORKER_PORT: z.coerce.number().default(3002),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  MAX_FILE_SIZE_MB: z.coerce.number().default(25),
  ALLOWED_FILE_TYPES: z.string().default("application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
  INTERVIEW_DEFAULT_DURATION: z.coerce.number().default(45),
  INTERVIEW_DEFAULT_DIFFICULTY: z.string().default("medium"),
  INTERVIEW_LINK_EXPIRY_HOURS: z.coerce.number().default(72),
  INTERVIEW_RECORDING_ENABLED: z.coerce.boolean().default(true),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  LOG_FORMAT: z.enum(["json", "pretty"]).default("json"),
  SENTRY_DSN: z.string().default(""),
  DATA_RETENTION_CANDIDATE_DATA_DAYS: z.coerce.number().default(365),
  DATA_RETENTION_INTERVIEW_RECORDINGS_DAYS: z.coerce.number().default(180),
});

export function validateEnv(): Env {
  return envSchema.parse(process.env);
}

export { envSchema };
