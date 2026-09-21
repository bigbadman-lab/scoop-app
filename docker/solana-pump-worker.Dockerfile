# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY apps/solana-pump-worker/package.json apps/solana-pump-worker/
RUN pnpm install --frozen-lockfile=false --filter @scoop/solana-pump-worker...

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/db packages/db
COPY packages/shared packages/shared
COPY apps/solana-pump-worker apps/solana-pump-worker
RUN pnpm --filter @scoop/shared build \
  && pnpm --filter @scoop/db build \
  && pnpm --filter @scoop/solana-pump-worker build

FROM base AS runner
ENV NODE_ENV=production
# Indexing OFF by default — never enable without explicit canary approval.
ENV SCOOP_SOLANA_PUMP_INDEXING_ENABLED=false
ENV SCOOP_SOLANA_PUMP_TRADE_PROVIDER=pumpportal
WORKDIR /app
COPY --from=build /app /app
WORKDIR /app/apps/solana-pump-worker
CMD ["node", "dist/index.js"]
