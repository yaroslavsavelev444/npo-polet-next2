# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --dangerously-allow-all-builds

# ── base-builder: полный исходный код + зависимости, БЕЗ next build ────────
# Используется для payload migrate и bootstrap-admin: им нужен payload.config.ts
# и весь src/, который он импортирует, но next build им не требуется.
FROM base AS base-builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1

# ── builder: полноценная сборка Next.js ─────────────────────────────────────
# ВАЖНО: next build здесь обращается к Payload -> Postgres на этапе
# "Collecting page data" (generateMetadata, Server Components). Поэтому сборка
# ЭТОГО таргета обязана выполняться с сетевым доступом к уже поднятому
# и уже промигрированному Postgres — см. build.network в docker-compose.prod.yml
# и порядок операций в deploy.sh.
FROM base-builder AS builder
ARG DATABASE_URI
ARG PAYLOAD_SECRET
ENV DATABASE_URI=${DATABASE_URI} PAYLOAD_SECRET=${PAYLOAD_SECRET}
RUN pnpm payload:types
RUN pnpm build

# ── runner: минимальный production-образ ────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache curl
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3004
ENV PORT=3004
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://127.0.0.1:3004/api/health || exit 1

CMD ["node", "server.js"]