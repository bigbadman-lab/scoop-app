# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY apps/fee-keeper/package.json apps/fee-keeper/
RUN pnpm install --frozen-lockfile=false --filter @scoop/fee-keeper...

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY packages/db packages/db
COPY packages/shared packages/shared
COPY apps/fee-keeper apps/fee-keeper
RUN pnpm --filter @scoop/contracts build \
  && pnpm --filter @scoop/shared build \
  && pnpm --filter @scoop/db build \
  && pnpm --filter @scoop/fee-keeper build

FROM base AS runner
ENV NODE_ENV=production
# Writes OFF by default — set SCOOP_FEE_KEEPER_WRITE_ENABLED=true only after canary review.
ENV SCOOP_FEE_KEEPER_WRITE_ENABLED=false
WORKDIR /app
COPY --from=build /app /app
WORKDIR /app/apps/fee-keeper
# One-shot cron: acquire lock, service markets, exit.
CMD ["node", "dist/index.js"]
