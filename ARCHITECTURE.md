# Architecture Document

## Overview

Interviewed is a modular monolith with three main applications:

1. **Web** (Next.js) - React frontend with server-side rendering
2. **API** (Fastify) - REST API server with JWT auth
3. **Worker** (Node.js) - Background job processor

Shared packages provide types, configuration, database access, AI abstraction, queue infrastructure, and storage adapters.

## Request Flow

```
Browser → Next.js (web) → Fastify API (api/) → Prisma → PostgreSQL
                         → Redis (cache/session)
                         → RabbitMQ (async jobs) → Worker
                         → S3 (file storage)
```

## Authentication Flow

1. User submits credentials to `/api/v1/auth/login`
2. API verifies credentials against database (bcrypt)
3. API creates JWT access token (15min) and refresh token (7d)
4. Access token stored in httpOnly cookie
5. Subsequent requests include cookie; API validates JWT
6. On token expiry, client uses refresh token to get new access token

## AI Processing Flow

1. Resume uploaded → stored in S3 → queued for parsing
2. Worker picks up job → extracts text (PDF/DOCX) → stores normalized data
3. Candidate-job matching triggered → hybrid scoring engine runs
4. Results stored in CandidateJobMatch entity
5. HR reviews → approves/rejects → decisions stored separately from AI results
6. Interview invitation sent → secure token generated
7. Interview conducted → transcript stored → AI evaluation runs
8. Report generated → HR dashboard updated

## Data Flow Diagram

```
[Resume Upload] → [File Storage] → [Parse Queue] → [Worker] → [DB: Resume + Candidate]
                            ↓
[Candidate Match] ← [Job Requirements] → [Scoring Engine] → [DB: CandidateJobMatch]
                            ↓
[HR Decision] → [DB: HR Decision stored separately]
                            ↓
[Interview Invite] → [Email Queue] → [Worker] → [Email Service]
                            ↓
[Secure Link] → [Candidate Portal] → [Interview Session] → [AI Questions] → [Answers]
                            ↓
[Transcript] → [AI Evaluation] → [Report] → [HR Dashboard]
```
