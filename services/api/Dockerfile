# Build from the repo root so workspace packages are in the context:
#   docker build -f services/api/Dockerfile -t fretflow-api .
# Node 22 LTS, latest patch as of 2026-09-29 (security bump per D-012).
FROM node:22.23.3-slim

RUN corepack enable
WORKDIR /repo

# Manifests first so the dependency layer caches across source changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/api/package.json services/api/
COPY packages/score-model/package.json packages/score-model/
RUN pnpm install --frozen-lockfile --prod --filter "@fretflow/api..."

COPY packages/score-model/src packages/score-model/src
COPY services/api/src services/api/src
COPY services/api/drizzle services/api/drizzle
COPY services/api/tsconfig.json services/api/

WORKDIR /repo/services/api
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
USER node

# Migrations run on every start (BACKEND.md §9), then the server replaces the shell.
CMD ["sh", "-c", "node --experimental-strip-types --disable-warning=ExperimentalWarning --import ./src/runtime/register.ts src/db/migrate.ts && exec node --experimental-strip-types --disable-warning=ExperimentalWarning --import ./src/runtime/register.ts src/index.ts"]
