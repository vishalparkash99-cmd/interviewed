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
RUN npm run build -w packages/types && npm run build -w packages/config && npm run build -w apps/web

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Next.js standalone bundles all needed node_modules and packages
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static     ./apps/web/.next/static
COPY --from=builder /app/apps/web/public           ./apps/web/public

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
