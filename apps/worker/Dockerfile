FROM node:20-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends openssl python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/config/package.json packages/config/
COPY packages/database/package.json packages/database/
COPY packages/types/package.json packages/types/
COPY packages/queue/package.json packages/queue/
COPY packages/ai/package.json packages/ai/
COPY packages/storage/package.json packages/storage/
RUN npm ci

COPY . .
RUN npx prisma generate --schema=packages/database/prisma/schema.prisma
RUN npm run build -w packages/types && npm run build -w packages/config && npm run build -w packages/queue && npm run build -w packages/ai && npm run build -w packages/storage && npm run build -w packages/database && npm run build -w apps/worker

FROM node:20-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/config/package.json packages/config/
COPY packages/database/package.json packages/database/
COPY packages/types/package.json packages/types/
COPY packages/queue/package.json packages/queue/
COPY packages/ai/package.json packages/ai/
COPY packages/storage/package.json packages/storage/
RUN npm ci --omit=dev

COPY --from=builder /app/packages/types/dist      packages/types/dist
COPY --from=builder /app/packages/config/dist     packages/config/dist
COPY --from=builder /app/packages/queue/dist      packages/queue/dist
COPY --from=builder /app/packages/ai/dist         packages/ai/dist
COPY --from=builder /app/packages/storage/dist    packages/storage/dist
COPY --from=builder /app/packages/database/dist   packages/database/dist
COPY --from=builder /app/apps/worker/dist         apps/worker/dist

RUN npx prisma generate --schema=packages/database/prisma/schema.prisma

CMD ["node", "apps/worker/dist/index.js"]
