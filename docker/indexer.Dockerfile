# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/indexer/package.json apps/indexer/
COPY packages/contracts/package.json packages/contracts/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile=false --filter @scoop/indexer...

FROM deps AS build
COPY tsconfig.base.json ./
COPY scripts scripts
COPY packages/contracts packages/contracts
COPY packages/db packages/db
COPY packages/shared packages/shared
COPY apps/indexer apps/indexer
RUN pnpm --filter @scoop/contracts build \
  && pnpm --filter @scoop/db build \
  && pnpm --filter @scoop/shared build \
  && pnpm --filter @scoop/indexer build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app /app
WORKDIR /app/apps/indexer
CMD ["node", "dist/index.js"]
