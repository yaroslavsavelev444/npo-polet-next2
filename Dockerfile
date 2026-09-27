# syntax=docker/dockerfile:1
#
# Образы собираются в GitHub Actions и уезжают в GHCR (см.
# .github/workflows/deploy.yml). На VPS сборки больше не происходит — там
# только `docker pull`. Из этого следует главное свойство файла: он не имеет
# права зависеть ни от чего, что есть только на боевом сервере, — ни от
# `.env.production`, ни от работающего Postgres.
#
# Собираются два таргета:
#   runner — боевое приложение (Next.js standalone), минимальный образ;
#   tools  — миграции Payload и фоновые воркеры; нужен весь исходник и
#            node_modules, поэтому образ большой и в проде не обслуживает
#            запросы.

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
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# corepack install — отдельным шагом до install: так несоответствие версии
# видно сразу и отдельной ошибкой, а не посреди установки зависимостей.
RUN corepack install
RUN pnpm install --frozen-lockfile --dangerously-allow-all-builds

# ── base-builder: полный исходный код + зависимости, БЕЗ next build ────────
# Общая основа для `builder` (сборка Next.js) и `tools` (миграции, воркеры).
FROM base AS base-builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Кладём pnpm в СЛОЙ ОБРАЗА: иначе corepack пытался бы скачать его при каждом
# старте контейнера, и сетевой сбой означал бы неподнявшийся воркер.
RUN corepack install

# ── builder: сборка Next.js ────────────────────────────────────────────────
#
# ⚠ Живой Postgres здесь НЕ нужен, и это не случайность: на этапе
# «Generating static pages» Next один раз рендерит дерево серверных
# компонентов каждого маршрута, но все обращения к Payload идут через
# src/payload/services/getPayload.ts, который на фазе PHASE_PRODUCTION_BUILD
# возвращает заглушку. Раньше об этом свойстве не знали, и Dockerfile
# монтировал боевой .env.production BuildKit-секретом ради строки
# подключения, которой сборка всё равно не пользуется.
FROM base-builder AS builder

# Значения-заглушки. Схема src/env.ts требует, чтобы DATABASE_URI был
# валидным URL, а PAYLOAD_SECRET — непустым; содержимое при сборке не
# используется никем. Реальные значения приходят при ЗАПУСКЕ из
# .env.production на сервере и в образ не попадают вовсе.
ENV DATABASE_URI=postgresql://build:build@127.0.0.1:5432/build

# ⚠ PAYLOAD_SECRET задаётся НЕ через `ENV`, и это не стиль.
#
# BuildKit-проверка SecretsUsedInArgOrEnv ругается на любой ARG/ENV с
# «секретным» именем: `##[warning]SecretsUsedInArgOrEnv: Do not use ARG or ENV
# instructions for sensitive data (ENV "PAYLOAD_SECRET")`. Здесь значение
# заведомо не секрет, но проверка судит по имени, а не по содержимому, и
# гасить её `# check=skip=` значит выключить её и для настоящего секрета,
# если такой однажды появится.
#
# Значение нужно ровно одной команде — `pnpm build` ниже, — поэтому там же
# ему и место: переменная живёт только внутри того RUN и в слои образа не
# записывается вовсе.

# ⚠ NEXT_PUBLIC_* — это АРГУМЕНТЫ СБОРКИ, а не переменные запуска. Next
# подставляет их значения прямо в код на этапе компиляции, поэтому задать их
# в .env.production на сервере недостаточно: в собранном образе уже стоит то,
# что было при сборке.
#
# Именно из-за этого до перехода на сборку в CI в образ попадал
# NEXT_PUBLIC_APP_URL=http://localhost:3000 (значение по умолчанию из
# src/env.ts): старый Dockerfile извлекал из .env.production только
# DATABASE_URI и PAYLOAD_SECRET. Отсюда шли неверные абсолютные ссылки на
# медиа (payload.config.ts, serverURL) и адреса в письмах.
#
# Следствие, которое важно понимать: образ пригоден только для того домена, с
# которым собран. Для staging нужна отдельная сборка, а не другой набор
# переменных при запуске.
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_YM_ID

# ⚠ Значения проносятся в сборку через RUN, а не через `ENV`, и это не стиль.
#
# `vars.NEXT_PUBLIC_YM_ID` в GitHub Actions, если переменная не заведена,
# подставляется ПУСТОЙ СТРОКОЙ, а не отсутствует. Для zod-схемы в src/env.ts
# это разные вещи: `.optional()` разрешает `undefined`, но пустая строка не
# проходит `.regex(/^\d+$/)`. Вариант с `ENV NEXT_PUBLIC_YM_ID=$ARG` ронял
# сборку на «Invalid client environment variables» ровно в самой частой
# конфигурации — когда счётчик Метрики не подключён.
#
# Поэтому пустое значение здесь ЯВНО превращается в «переменная не задана».
RUN set -e; \
    if [ -z "${NEXT_PUBLIC_APP_URL:-}" ]; then \
        echo "NEXT_PUBLIC_APP_URL не передан в сборку." >&2; \
        echo "Заведите переменную NEXT_PUBLIC_APP_URL в GitHub:" >&2; \
        echo "  Settings -> Secrets and variables -> Actions -> Variables" >&2; \
        echo "Значение попадает в код на этапе компиляции, и подставить его" >&2; \
        echo "позже, при запуске, уже нельзя — см. deploy/README.md." >&2; \
        exit 1; \
    fi; \
    export NEXT_PUBLIC_APP_URL; \
    if [ -n "${NEXT_PUBLIC_YM_ID:-}" ]; then export NEXT_PUBLIC_YM_ID; else unset NEXT_PUBLIC_YM_ID; fi; \
    export PAYLOAD_SECRET=build-time-placeholder-not-a-secret; \
    pnpm payload:types && pnpm build

# ── tools: миграции Payload и фоновые воркеры ──────────────────────────────
#
# Тот же контент, что и base-builder (нужен payload.config.ts и весь src/), но
# НЕ под root. base-builder — build-стейдж, в нём нет USER, и долгоживущий
# процесс, запущенный прямо на нём, работал бы в проде от root с доступом к
# Postgres, Redis и полным набором сборочного инструментария.
#
# ⚠ uid/gid 1001 менять нельзя. Docker на этом сервере работает с
# userns-remap, а том polet-next_media_data уже создан с владельцем,
# производным от 1001. Другой uid — это EACCES при записи медиа.
#
# ⚠ Владелец задаётся флагом `COPY --chown`, а не `RUN chown -R /app`.
#
# `chown -R` поверх уже скопированного дерева не меняет права «на месте»: в
# слоях образа это ПОЛНАЯ КОПИЯ /app — node_modules целиком плюс исходники,
# около гигабайта. И поскольку исходники меняются в каждом коммите, этот
# гигабайтный слой был новым в каждой сборке: CI тратил на него ~80 с, а VPS
# на каждой выкладке заново скачивал его из GHCR. На этом скачивании SSH-сессия
# выкладки однажды и оборвалась («client_loop: send disconnect: Broken pipe»).
#
# С `--chown` слоёв два, и порядок важен: node_modules (большой) меняется
# только вместе с lock-файлом и в остальных выкладках уже лежит на сервере;
# исходники (единицы мегабайт) идут вторым слоем и меняются каждый раз.
# Поэтому стадия строится от `base`, а не от `base-builder`: тот копирует
# файлы от root, и сменить владельца поверх него можно было бы только тем же
# `chown -R`.
FROM base AS tools
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs \
    && chown nextjs:nodejs /app
COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules
# public/ (картинки витрины, ~90 МБ) миграциям и воркерам не нужен — его
# отдаёт образ приложения. Без него слой исходников весит единицы мегабайт.
COPY --chown=nextjs:nodejs --exclude=public . .
ENV NEXT_TELEMETRY_DISABLED=1
USER nextjs
# Команду задаёт docker-compose.prod.yml (миграции или воркер). CMD по
# умолчанию — миграции: самое частое применение этого образа.
#
# Запускаем node напрямую, а не через `pnpm ...`: corepack кэширует менеджер
# пакетов в домашнем каталоге ТОГО пользователя, который его ставил (root на
# стейдже выше), поэтому под непривилегированным nextjs pnpm пришлось бы
# качать заново при каждом старте контейнера — сетевой сбой означал бы
# несостоявшуюся миграцию.
#
# --disable-warning=MODULE_TYPELESS_PACKAGE_JSON гасит ровно один код
# предупреждения Node: «Module type of file:///app/payload.config.ts is not
# specified». Штатный способ его убрать — `"type": "module"` в package.json —
# здесь недоступен: Next кладёт корневой package.json в .next/standalone, а
# сгенерированный им server.js — CommonJS (require/__dirname), и боевой
# контейнер после такой правки не стартовал бы вовсе.
CMD ["node", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--experimental-strip-types", "scripts/payload-cli.mts", "migrate"]

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
