# Interviewed - AI Recruitment Platform

## Quick Start

```bash
# 1. Clone and install dependencies
npm install

# 2. Start infrastructure
cd docker-compose.yml

# 3. Copy environment
cp .env.example .env

# 4. Generate Prisma client
npm run prisma:generate

# 5. Run migrations
npm run prisma:migrate

# 6. Start all services
npm run dev
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| Web | 3000 | Next.js frontend |
| API | 3001 | Fastify backend |
| Worker | 3002 | Background worker |
| PostgreSQL | 5432 | Database |
| Redis | 6379 | Cache |
| RabbitMQ | 5672 | Message queue |
| MinIO | 9000 | Object storage |
| MailHog | 8025 | Email testing |

## Environment Variables

See `.env.example` for all configuration options.

## Database

```bash
# Run migrations
npm run prisma:migrate

# Open Prisma Studio
npm run prisma:studio

# Seed development data
npm run prisma:seed
```

## Testing

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests
npm run test:integration
```

## Docker

```bash
# Start all services
docker-compose up -d

# Stop
docker-compose down
```

## Architecture

```
apps/
  web/       Next.js frontend (port 3000)
  api/       Fastify API server (port 3001)
  worker/    Background job processor (port 3002)

packages/
  database/  Prisma schema & client
  ai/        AI provider abstraction
  queue/     Queue infrastructure
  types/     Shared TypeScript types
  storage/   S3/storage adapter
  config/    Config, env, logging
```

## User Roles

- **Super Admin**: Platform-wide administration
- **Organization Admin**: Manage organization, jobs, members
- **Recruiter/HR**: Create jobs, manage candidates, view reports
- **Candidate**: View interview portal, take interviews

## Security

- All API endpoints require JWT authentication
- Passwords hashed with bcrypt
- File uploads validated for type and size
- Signed URLs for object storage access
- Rate limiting on all endpoints
- Audit logging for sensitive operations
- Input validation with Zod schemas
