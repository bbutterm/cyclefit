FROM node:22-alpine

WORKDIR /app
RUN corepack enable

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/

RUN pnpm install --frozen-lockfile --filter @cyclefit/backend... --filter @cyclefit/shared

COPY packages/shared packages/shared
COPY apps/backend apps/backend

RUN pnpm --filter @cyclefit/backend prisma:generate

WORKDIR /app/apps/backend
EXPOSE 3000
CMD ["sh", "-c", "pnpm prisma:migrate && pnpm start"]
