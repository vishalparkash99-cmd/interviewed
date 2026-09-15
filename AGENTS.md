# Interviewed - AI Recruitment Platform

## Agent Instructions

### Project Structure

```
apps/
  web/       Next.js 14 frontend (port 3000) - React app router
  api/       Fastify backend (port 3001)
  worker/    Background job processor (daemon mode)

packages/
  database/  Prisma schema (prisma/schema.prisma) + client generation
  ai/        AI abstraction layer:
               - providers.ts   (OpenAI, Anthropic, mock)
               - matching-engine.ts (hybrid candidate-job matching)
               - interview-planner.ts (dynamic interview plan generation)
               - evaluation-engine.ts (post-interview AI evaluation)
               - security.ts     (anti-injection, sanitization, schema validation)
               - schemas.ts      (Zod schemas for AI I/O)
               - types.ts        (AI-related TypeScript types)
               - index.ts        (public API)
  queue/     RabbitMQ + Redis queue infrastructure
  types/     Shared TypeScript types and enums (UserRole, JobStatus, etc.)
  storage/   S3/local storage abstraction
  config/    Environment configuration, logger, constants

scripts/   Seed and migration scripts
tests/     Jest tests (unit + integration)
```

### Technology Stack

- **Frontend**: Next.js 14 + React 18 + TypeScript + Tailwind CSS
- **Backend**: Fastify + TypeScript (decorator-free, functional style)
- **Database**: PostgreSQL 16 + Prisma ORM (UUIDs, soft deletes, indexes)
- **Cache**: Redis 7
- **Queue**: RabbitMQ 3 + Redis (fallback polling)
- **Storage**: S3-compatible (MinIO local, AWS S3 production)
- **AI**: Provider-agnostic abstraction (OpenAI, Anthropic, configurable)
- **Auth**: JWT (access + refresh tokens), bcrypt password hashing, cookie-based sessions

### Key Commands

| Command | Description |
|---------|-------------|
| `npm install` | Install all workspace dependencies |
| `npm run dev` | Start all services concurrently (web, api, worker) |
| `npm run dev:api` | Start API server only |
| `npm run dev:worker` | Start worker only |
| `npm run dev:web` | Start web frontend only |
| `npm run prisma:migrate` | Deploy database migrations |
| `npm run prisma:generate` | Generate Prisma client from schema |
| `npm run prisma:seed` | Seed development data |
| `npm run test` | Run all tests with coverage |
| `npm run test:unit` | Run unit tests only |
| `docker-compose up -d` | Start all infrastructure services |
| `docker-compose down` | Stop all infrastructure services |

### Environment Variables

All environment variables are documented in `.env.example`. Key ones:

- `DATABASE_URL` - PostgreSQL connection string (required)
- `REDIS_URL` - Redis connection string (required)
- `RABBITMQ_URL` - RabbitMQ connection string (required)
- `JWT_SECRET` - JWT signing secret, min 32 chars (required)
- `AI_PROVIDER` - `openai`, `anthropic`, or `mock` (default: `mock`)
- `STORAGE_PROVIDER` - `s3` or `local` (default: `local`)
- `EMAIL_PROVIDER` - `resend`, `smtp`, or `mock` (default: `mock`)
- `NODE_ENV` - `development`, `production`, `test`

### User Roles (RBAC)

Enforced server-side on every API route via `verifyAuth` and `requireRole` decorators:

| Role | Description |
|------|-------------|
| `super_admin` | Platform-wide administration, manages all organizations |
| `org_admin` | Manage organization, jobs, members |
| `recruiter` | Create jobs, manage candidates, view reports |
| `candidate` | View interview portal, take interviews |

### Database Schema

Defined in `packages/database/prisma/schema.prisma`. Core entities:

- **Organization** → Users, Jobs, AuditLogs, EmailConfigs
- **User** → RefreshTokens, AuditLogs, Jobs (as owner), Candidates
- **Job** → Candidates, Interviews, CandidateJobMatches
- **Candidate** → Resume, CandidateJobMatches, Interviews
- **Interview** → InterviewSessions, Questions, Answers, TranscriptSegments, Evaluation, Report
- **AIProcessingJob** → Async task queue with retry/dead-letter

All entities use UUID primary keys, soft deletion (`deletedAt`), and timestamps (`createdAt`, `updatedAt`).

### AI Security

- All user inputs (resumes, interview answers) treated as untrusted data
- Anti-prompt-injection filters applied before sending to LLM (`packages/ai/src/security.ts`)
- Clear separation: SYSTEM INSTRUCTIONS → JOB REQUIREMENTS → CANDIDATE DATA → AI OUTPUT
- AI outputs validated against Zod schemas before use
- Never execute AI-generated code, SQL, or shell commands

### Architecture Patterns

- **Modular monolith**: Services can be extracted later (no cross-package circular deps)
- **Repository pattern**: Prisma client acts as repository
- **Dependency injection**: AI providers injected via interfaces
- **Event-driven async**: RabbitMQ for expensive operations (parsing, matching, evaluation)
- **JWT + cookie auth**: Access token in httpOnly cookie, refresh token in DB
- **RBAC**: Server-side permission checks on every route

### Queue Workers

Expensive operations run asynchronously via RabbitMQ:

| Queue | Purpose |
|-------|---------|
| `resume.parsing` | Parse uploaded resumes (PDF/DOCX) |
| `candidate.matching` | Run candidate-job matching engine |
| `ai.evaluation` | AI evaluation of interviews |
| `email.sending` | Send transactional emails |
| `report.generation` | Generate HR reports |

### Important Notes

- Never hard-code AI provider keys in source code - always use `@interviewed/config`
- Always validate inputs with Zod schemas in route handlers
- Audit log all sensitive operations (writes, deletions, status changes)
- Use database transactions for multi-step operations
- Never log PII, passwords, tokens, or full resumes
- AI recommendations are advisory only - HR makes final decisions
- Do NOT evaluate candidates on protected characteristics (race, gender, age, etc.)
- Interview recordings require explicit candidate consent

### Development Workflow

1. Start infrastructure: `docker-compose up -d`
2. Generate Prisma: `npm run prisma:generate`
3. Migrate database: `npm run prisma:migrate`
4. Seed (optional): `npm run prisma:seed`
5. Start services: `npm run dev`
6. Access: http://localhost:3000 (web), http://localhost:3001 (API), http://localhost:15672 (RabbitMQ)
