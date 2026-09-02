# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
# Версия pnpm нигде не дублируется: её единственный источник — поле
# packageManager в package.json, которое читает corepack (`corepack install`
# ниже). Раньше версия не была закреплена вообще, и три окружения брали три
# разные: локально pnpm 11, в CI жёстко прописанная 9, в образе — дефолт
# corepack. Из-за этого CI падал с ERR_PNPM_LOCKFILE_CONFIG_MISMATCH (pnpm 9
# не читает overrides из pnpm-workspace.yaml), а флаг
# --dangerously-allow-all-builds ниже вообще существует только с pnpm 10+.
RUN corepack enable
# Скачивание менеджера пакетов не должно ждать подтверждения в TTY-less сборке.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
# corepack install — отдельным шагом до install: так несоответствие версии
# видно сразу и отдельной ошибкой, а не посреди установки зависимостей.
RUN corepack install
RUN pnpm install --frozen-lockfile --dangerously-allow-all-builds

# ── base-builder: полный исходный код + зависимости, БЕЗ next build ────────
# Используется для payload migrate и bootstrap-admin: им нужен payload.config.ts
# и весь src/, который он импортирует, но next build им не требуется.
FROM base AS base-builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Кладём pnpm в СЛОЙ ОБРАЗА: на этом стейдже основаны migrate и worker, чей
# CMD — `pnpm ...`. Без этого шага corepack пытался бы скачать pnpm при каждом
# старте контейнера, и сетевой сбой означал бы, что не поднимается воркер
# отложенного удаления аккаунтов.
RUN corepack install

# ── builder: полноценная сборка Next.js ─────────────────────────────────────
# ВАЖНО: next build здесь обращается к Payload -> Postgres на этапе
# "Collecting page data" (generateMetadata, Server Components). Поэтому сборка
# ЭТОГО таргета обязана выполняться с сетевым доступом к уже поднятому
# и уже промигрированному Postgres — см. build.network в docker-compose.prod.yml
# и порядок операций в deploy.sh.
FROM base-builder AS builder
ENV NEXT_TELEMETRY_DISABLED=1
# DATABASE_URI и PAYLOAD_SECRET нужны build-команде (payload:types/next build),
# но НЕ должны попадать в слои образа. Раньше они передавались через ARG/ENV и
# оседали в метаданных промежуточного образа (docker history). Теперь .env.
# production монтируется как BuildKit-секрет ТОЛЬКО на время этого RUN
# (/run/secrets/prod_env не сохраняется ни в одном слое), а нужные значения
# извлекаются в переменные окружения самого процесса сборки.
RUN --mount=type=secret,id=prod_env \
    export DATABASE_URI="$(grep -E '^DATABASE_URI=' /run/secrets/prod_env | cut -d= -f2-)" && \
    export PAYLOAD_SECRET="$(grep -E '^PAYLOAD_SECRET=' /run/secrets/prod_env | cut -d= -f2-)" && \
    pnpm payload:types && \
    pnpm build

# ── worker: long-running фоновые обработчики ────────────────────────────────
# Тот же контент, что и base-builder (worker'у нужен payload.config.ts и весь
# src/), но НЕ под root. base-builder — это build-стейдж: в нём нет USER,
# поэтому account-deletion-worker, работавший прямо на нём, крутился в
# production сутками от root'а с доступом к Postgres и Redis и полным набором
# сборочного инструментария. Долгоживущий процесс обязан быть непривилегированным
# ровно так же, как runner.
FROM base-builder AS worker
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs \
    && chown -R nextjs:nodejs /app
USER nextjs
# Запускаем tsx напрямую, а не через `pnpm worker:account-deletion`: corepack
# кэширует менеджер пакетов в домашнем каталоге ТОГО пользователя, который его
# ставил (root на стейдже выше), поэтому под непривилегированным nextjs pnpm
# пришлось бы качать заново при каждом старте контейнера — сетевой сбой
# означал бы неподнявшийся воркер. Команда та же, что в скрипте
# worker:account-deletion в package.json.
CMD ["node_modules/.bin/tsx", "src/modules/account-deletion/worker.ts"]

# ── runner: минимальный production-образ ────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache curl
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Payload (upload.staticDir: 'media') пишет сюда загруженные файлы. Каталог
# должен существовать и принадлежать nextjs ДО первого монтирования named
# volume media_data:/app/media — Docker инициализирует содержимое и владельца
# пустого volume копированием из этого пути в образе. Без этого volume
# создаётся как root:root, и запись падает с EACCES под non-root USER nextjs.
RUN mkdir -p ./media && chown nextjs:nodejs ./media

USER nextjs
EXPOSE 3004
ENV PORT=3004
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://127.0.0.1:3004/api/health || exit 1

CMD ["node", "server.js"]