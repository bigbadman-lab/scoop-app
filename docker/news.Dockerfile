# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/db/package.json packages/db/
COPY packages/news/package.json packages/news/
RUN pnpm install --frozen-lockfile=false --filter @scoop/news...

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/db packages/db
COPY packages/news packages/news
RUN pnpm --filter @scoop/db build \
  && pnpm --filter @scoop/news build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app /app
WORKDIR /app/packages/news
# One-shot cron: ingest latest page, filter relevance, upsert, exit.
CMD ["node", "dist/commands/ingest-once.js"]
