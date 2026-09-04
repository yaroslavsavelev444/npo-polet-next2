#!/usr/bin/env bash
#
# deploy/deploy.sh — выкладка polet-next на VPS.
#
# Запускается по SSH из GitHub Actions (.github/workflows/deploy.yml) уже
# ПОСЛЕ того, как образы собраны и лежат в GHCR:
#
#   GIT_SHA=<sha> REGISTRY=ghcr.io REPO=owner/repo \
#   GHCR_USER=<actor> GHCR_TOKEN=<token> bash deploy/deploy.sh
#
# Руками на сервере:
#   .../deploy.sh --status     что выкачено сейчас и на что можно откатиться
#   .../deploy.sh --restart    перечитать .env.production, не меняя версию кода
#   .../deploy.sh --rollback   вернуться на предыдущий успешный SHA
#
# ─── Чего этот скрипт НЕ делает ─────────────────────────────────────────────
#
# 1. Не собирает образы. Их собрал CI. Отсюда исчезло больше половины прежнего
#    скрипта: сборка в проде, ожидание её таймаута, чистка build-кэша (на
#    сервере его накопилось 20 ГБ) и пересборка при откате. Откат теперь —
#    запуск уже лежащего на диске тега: секунды.
#
# 2. Не ходит в git. Конфигурацию (этот каталог + docker-compose.prod.yml)
#    привозит сам workflow по SSH в releases/<sha>/. На сервере не нужны ни
#    доступ к приватному репозиторию, ни deploy key, ни рабочая копия. Именно
#    поэтому исчезла ошибка «could not read Username for https://github.com»:
#    механизма, который её порождал, больше нет.
#
# ─── Безопасность данных ────────────────────────────────────────────────────
#
# Скрипт НИКОГДА не вызывает `docker volume rm`, `docker compose down`,
# `down -v`, `docker system prune` и `image prune -a`. Тома
# polet-next_postgres_data, polet-next_media_data и polet-next_redis_data не
# удаляются ни при каких обстоятельствах и ни в одной ветке выполнения.
#
# И перед каждой выкладкой снимается дамп базы И архив медиа — ДО любых
# изменений. Откат образа не откатывает данные: миграция или баг в новом коде
# портят их без единого разрушающего вызова.

set -Eeuo pipefail

### ── Настройки ────────────────────────────────────────────────────────────
PROJECT_DIR="${PROJECT_DIR:-/home/y4s/polet-next}"
# Совпадает с `name:` в docker-compose.prod.yml и, что важнее, с префиксом
# существующих томов на сервере. В боевом окружении менять нельзя: другое имя
# проекта — это другие тома, то есть пустая база рядом с настоящей.
# Переопределение существует ради изолированного стенда, а не ради прода.
COMPOSE_PROJECT="${COMPOSE_PROJECT:-polet-next}"
ENV_FILE="${ENV_FILE:-$PROJECT_DIR/.env.production}"

# Каталог этой выкладки: releases/<sha>/. Скрипт лежит внутри него, поэтому
# определяем путь от себя, а не от текущего каталога — по SSH и из cron
# текущий каталог это домашний, и всё относительное указывало бы не туда.
RELEASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$RELEASE_DIR/docker-compose.prod.yml"

HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-180}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"
KEEP_BACKUPS="${KEEP_BACKUPS:-7}"
KEEP_LOG_DAYS="${KEEP_LOG_DAYS:-30}"

# Профили compose, поднимаемые при выкладке. Пусто — только базовый стек
# (postgres, redis, app). См. комментарий у account-deletion-worker в
# docker-compose.prod.yml, прежде чем добавлять сюда "workers".
UP_PROFILES="${UP_PROFILES:-}"

STATE_DIR="$PROJECT_DIR/.deploy-state"
STATE_FILE="$STATE_DIR/last_successful_sha"
# ⚠ Отдельный файл, а не «предыдущая строка в том же»: без него ручной
# `--rollback` откатывал бы на SHA, который И ТАК работает, то есть не
# делал бы ничего — а нужен он ровно тогда, когда откатиться надо срочно.
PREV_FILE="$STATE_DIR/previous_successful_sha"
LOG_DIR="$PROJECT_DIR/logs"

# Бэкапы — вне каталога проекта, куда пишет выкладка. Если каталог не создан
# или недоступен на запись, откатываемся на путь внутри проекта: выкладка без
# бэкапа не поедет, но и падать из-за отсутствия каталога она не должна.
BACKUP_DIR="${BACKUP_DIR:-/var/backups/polet-next}"
if ! mkdir -p "$BACKUP_DIR" 2>/dev/null || [[ ! -w "$BACKUP_DIR" ]]; then
    BACKUP_DIR="$PROJECT_DIR/backups"
    mkdir -p "$BACKUP_DIR"
fi
chmod 700 "$BACKUP_DIR" 2>/dev/null || true

# /run/lock живёт до перезагрузки — ровно то, что нужно замку выкладки.
if mkdir -p /run/lock 2>/dev/null && [[ -w /run/lock ]]; then
    LOCK_FILE="/run/lock/polet-next-deploy.lock"
else
    LOCK_FILE="/tmp/polet-next-deploy.lock"
fi

mkdir -p "$STATE_DIR" "$LOG_DIR"

LOG_FILE="$LOG_DIR/deploy-$(date '+%Y%m%d-%H%M%S').log"
exec > >(tee -a "$LOG_FILE") 2>&1
ln -sfn "$LOG_FILE" "$LOG_DIR/latest.log"

log()  { echo "[$(date '+%F %T')] $*"; }
fail() { log "❌ $*"; exit 1; }

### ── Compose ──────────────────────────────────────────────────────────────
#
# `--project-directory` обязателен: относительные пути внутри compose-файла
# (в частности `env_file: .env.production`) разрешаются от него, а сам файл
# лежит в releases/<sha>/, а не в корне проекта.
compose() {
    docker compose \
        --project-directory "$PROJECT_DIR" \
        --env-file "$ENV_FILE" \
        -p "$COMPOSE_PROJECT" \
        -f "$COMPOSE_FILE" "$@"
}

# Теги собираются из тех же переменных, что и в workflow. Совпадение
# обеспечивается тем, что обе стороны читают одно и то же, а не тем, что
# кто-то помнит формат.
#
# ⚠ REGISTRY и REPO приходят из workflow только при выкладке. Ручные
# `--rollback` и `--restart` запускает человек в обычной сессии, где их нет, и
# без запомненных значений имя образа сложилось бы в «/-app:<sha>» — то есть
# срочный откат падал бы на «pull access denied» в худший для этого момент.
# Поэтому после каждой успешной выкладки они сохраняются рядом с состоянием.
REGISTRY="${REGISTRY:-$(cat "$STATE_DIR/registry" 2>/dev/null || echo '')}"
REPO="${REPO:-$(cat "$STATE_DIR/repo" 2>/dev/null || echo '')}"

# Имя тома с медиа. Совпадает с `name:` в docker-compose.prod.yml и с тем, что
# реально существует на сервере.
MEDIA_VOLUME="${MEDIA_VOLUME:-polet-next_media_data}"

image_app()   { echo "${REGISTRY}/${REPO}-app:${1}"; }
image_tools() { echo "${REGISTRY}/${REPO}-tools:${1}"; }

up_and_wait() {
    # `--wait` возвращает ненулевой код, если хоть один сервис с healthcheck
    # не стал healthy. Это и есть health-gate: у app проверка бьёт в
    # /api/health, то есть в доступность Payload и Postgres, а не в факт
    # «процесс слушает порт».
    #
    # `--remove-orphans` намеренно НЕ используется: в проекте polet-next на
    # сервере есть контейнеры от прежних итераций, и удалять что-либо
    # «заодно» выкладка не должна.
    COMPOSE_PROFILES="$UP_PROFILES" compose up -d --wait --wait-timeout "$HEALTH_TIMEOUT"
}

### ── Чтение значения из env-файла ─────────────────────────────────────────
#
# Отдельной функцией, а не в одну строку с кавычками: значение пароля может
# быть записано в кавычках, и снимать их нужно аккуратно и в одном месте.
read_env_var() {
    local key="$1" line
    [[ -f "$ENV_FILE" ]] || return 0
    line=$(grep -E "^[[:space:]]*${key}=" "$ENV_FILE" | tail -n1 || true)
    line="${line#*=}"
    line="${line%\"}"; line="${line#\"}"
    line="${line%\'}"; line="${line#\'}"
    printf '%s' "$line"
}

### ── Проверка со стороны хоста ────────────────────────────────────────────
#
# ⚠ Дополняет health-gate, а не дублирует его. `--wait` смотрит на HEALTHCHECK
# контейнера, а тот бьёт в 127.0.0.1:3004 ИЗНУТРИ контейнера — то есть
# подтверждает, что жив процесс, и ничего не говорит о том, доступно ли
# приложение на порту хоста, откуда его забирает nginx. Между этими двумя
# фактами лежит публикация порта, и она — часть выкладки.
#
# Практическая польза видна на первой же аварии: когда сайт отдавал 502, знать,
# отвечает ли 127.0.0.1:3004, значило сразу отделить сломанное приложение от
# проблемы на уровне nginx. Без этой строки такой ответ приходилось добывать
# руками, уже после того, как выкладка отрапортовала об успехе.
HOST_PORT="${HOST_PORT:-3004}"

wait_host_port() {
    local url="http://127.0.0.1:${HOST_PORT}/api/health"
    local deadline=$(( $(date +%s) + 60 ))
    local code
    log "🌐 Проверка с хоста: $url"
    while true; do
        code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$url" 2>/dev/null || echo 000)
        if [[ "$code" == "200" ]]; then
            log "✅ Приложение отвечает на порту хоста ${HOST_PORT}"
            # ⚠ Размер ЗАГОЛОВКА ответа пишется в лог намеренно.
            #
            # 4 сентября 2026 сайт лёг на 502 «upstream sent too big header»:
            # Next стал отдавать заголовок Link с preload-ссылками и CSP с
            # nonce, вместе 4879 байт, а proxy_buffer_size у nginx оставался
            # умолчанием в 4096. Приложение при этом было полностью исправно,
            # и разбор ушёл в сторону контейнеров.
            #
            # Здесь не место проверять чужой конфиг — deploy.sh про nginx не
            # знает и знать не должен. Но одно число в логе выкладки делает
            # следующий такой случай очевидным за секунду вместо часа.
            # Требование к nginx описано в deploy/README.md.
            local header_bytes
            header_bytes=$(curl -sS -D - -o /dev/null --max-time 10 \
                "http://127.0.0.1:${HOST_PORT}/" 2>/dev/null | wc -c | tr -d ' ' || echo '?')
            log "ℹ️  Размер заголовка ответа: ${header_bytes} Б (nginx: proxy_buffer_size должен быть заметно больше)"
            return 0
        fi
        if (( $(date +%s) >= deadline )); then
            log "❌ Порт хоста ${HOST_PORT} не отдаёт 200 (последний код: $code)"
            return 1
        fi
        sleep 3
    done
}

### ── Бэкап перед изменениями ──────────────────────────────────────────────
#
# Отдельно от ночного scripts/backup/pg-backup.sh и в отдельный подкаталог:
# у ночного своя недельная история, и частые выкладки не должны её вытеснять.
pre_deploy_backup() {
    local stamp dir db_dest media_dest size
    stamp="$(date '+%Y%m%d-%H%M%S')"
    dir="$BACKUP_DIR/pre-deploy"
    mkdir -p "$dir"; chmod 700 "$dir" 2>/dev/null || true

    local pg_password
    # Пароль читаем из env-файла и передаём переменной окружения контейнера,
    # а не аргументом: аргументы видны в `ps` любому на машине.
    pg_password="$(read_env_var POSTGRES_PASSWORD)"

    db_dest="$dir/db-$stamp.dump"
    log "💾 Дамп PostgreSQL перед выкладкой → $db_dest"
    if ! compose exec -T -e PGPASSWORD="$pg_password" postgres \
            pg_dump -U npo_user -d npo_polet -Fc --no-password > "$db_dest"; then
        rm -f "$db_dest"
        fail "Дамп базы не удался — выкладка остановлена ДО каких-либо изменений"
    fi
    size=$(stat -c%s "$db_dest" 2>/dev/null || echo 0)
    # Оборванный дамп всё равно весит байты заголовка; порог отсекает
    # очевидно пустой файл. Целостность проверяет pg_restore --list ниже.
    (( size > 1024 )) || { rm -f "$db_dest"; fail "Дамп подозрительно мал (${size} Б)"; }
    if ! compose exec -T postgres pg_restore --list < "$db_dest" > /dev/null; then
        rm -f "$db_dest"
        fail "Дамп не прошёл проверку целостности (pg_restore --list)"
    fi
    chmod 600 "$db_dest"
    log "✅ Дамп базы готов (${size} Б), оглавление читается"

    # ⚠ Медиа копируются тоже, и это не перестраховка. База без файлов
    # восстановит карточки товаров, у которых не откроется ни одна картинка;
    # том polet-next_media_data существует в одном экземпляре.
    #
    # Архив пишется в stdout и перенаправляется на хосте, а не в примонтированный
    # каталог: на этом сервере Docker работает с userns-remap, и файл, созданный
    # внутри контейнера, принадлежал бы смещённому uid — владелец выкладки не
    # смог бы его ни прочитать, ни удалить при ротации.
    media_dest="$dir/media-$stamp.tar.gz"
    log "💾 Архив медиа → $media_dest"
    if ! docker run --rm -v "$MEDIA_VOLUME":/media:ro alpine:3 \
            tar czf - -C /media . > "$media_dest"; then
        rm -f "$media_dest"
        fail "Архив медиа не удался — выкладка остановлена ДО каких-либо изменений"
    fi
    # Целостность, а не размер. Порог в байтах здесь не годится: пустой том
    # даёт корректный архив в полторы сотни байт, и проверка «мал — значит
    # битый» останавливала бы выкладку на ровном месте. `gzip -t` читает
    # архив целиком и ловит именно обрыв.
    if ! gzip -t "$media_dest" 2>/dev/null; then
        rm -f "$media_dest"
        fail "Архив медиа не проходит проверку целостности (gzip -t)"
    fi
    size=$(stat -c%s "$media_dest" 2>/dev/null || echo 0)
    chmod 600 "$media_dest"
    log "✅ Архив медиа готов (${size} Б), gzip -t пройден"

    # Ротация: оставляем последние KEEP_BACKUPS каждого вида. Считаем и режем
    # по списку, а не по `-mtime`: при нескольких выкладках в день срез по
    # возрасту либо не удаляет ничего, либо удаляет всё за день.
    local kind
    for kind in 'db-*.dump' 'media-*.tar.gz'; do
        # shellcheck disable=SC2012
        { ls -1t "$dir"/$kind 2>/dev/null || true; } | tail -n "+$((KEEP_BACKUPS + 1))" | while read -r old; do
            rm -f -- "$old"
            log "🗑  Удалён старый пред-выкладочный бэкап: $(basename "$old")"
        done
    done
}

### ── Откат ────────────────────────────────────────────────────────────────
rollback_to() {
    local sha="$1"
    [[ -n "$REGISTRY" && -n "$REPO" ]] \
        || fail "не известны REGISTRY/REPO (нет $STATE_DIR/registry): откат до первой успешной выкладки новой схемы невозможен — см. deploy/README.md, §6a"
    # Сигнал посреди отката оставил бы систему в состоянии хуже любой из двух
    # версий. На время восстановления они подавляются.
    trap '' TERM INT HUP

    log "🔙 Откат на $sha"

    local prev_release="$PROJECT_DIR/releases/$sha"
    local prev_compose="$prev_release/docker-compose.prod.yml"
    # Конфигурация обязана вернуться вместе с образом: compose новой версии
    # может описывать сервис, которого в старом образе нет.
    if [[ -f "$prev_compose" ]]; then
        COMPOSE_FILE="$prev_compose"
    else
        log "⚠️  releases/$sha не найден — откатываем на текущем compose-файле"
    fi

    # Образы прошлой версии обычно уже на диске. Если их вычистили — пробуем
    # скачать: тег в реестре живёт дольше локального образа.
    docker image inspect "$(image_app "$sha")" >/dev/null 2>&1 \
        || docker pull "$(image_app "$sha")" \
        || { log "❌ Образ приложения $sha недоступен — автооткат невозможен"; return 1; }
    docker image inspect "$(image_tools "$sha")" >/dev/null 2>&1 \
        || docker pull "$(image_tools "$sha")" || true

    # ⚠ Миграции при откате НЕ откатываются, и это осознанно. `payload
    # migrate:down` — разрушающая операция над боевыми данными, запускать её
    # автоматически, без человека, нельзя. Схема Payload переживает работу
    # предыдущей версии кода в подавляющем большинстве случаев (добавленные
    # колонки просто не используются). Если конкретная миграция несовместима
    # со старым кодом — это ручной сценарий с дампом из pre-deploy/.
    IMAGE_APP="$(image_app "$sha")" IMAGE_TOOLS="$(image_tools "$sha")" up_and_wait \
        || { log "❌ Откат не поднялся"; return 1; }

    ln -sfn "$prev_release" "$PROJECT_DIR/current" 2>/dev/null || true
    log "✅ Откат выполнен, работает $sha"
    return 0
}

### ── Перезапуск с текущими образами ───────────────────────────────────────
#
# Нужен, когда изменился .env.production, а не код: переменные читаются
# процессом при старте, поэтому «перечитать конфигурацию» — это перезапуск.
#
# Образы берём у РАБОТАЮЩИХ контейнеров, а не из состояния: `docker inspect`
# отвечает тем, что выкачено на самом деле, и перезапуск не может молча
# подменить версию, если состояние и реальность разошлись.
running_image() {
    local id
    id=$(compose ps -q "$1" 2>/dev/null) || return 1
    [[ -n "$id" ]] || return 1
    docker inspect --format '{{.Config.Image}}' "$id" 2>/dev/null
}

cmd_restart() {
    [[ -f "$ENV_FILE" ]] || fail "$ENV_FILE отсутствует"
    local app_image tools_image before_app
    app_image=$(running_image app) \
        || fail "Контейнер app не запущен — перезапускать нечего, нужна выкладка"
    tools_image="$(image_tools "$(cat "$STATE_FILE" 2>/dev/null || echo latest)")"

    log "=== 🔄 Перезапуск с обновлённым $ENV_FILE ==="
    log "   app: $app_image"
    before_app=$(compose ps -q app 2>/dev/null || echo "")

    IMAGE_APP="$app_image" IMAGE_TOOLS="$tools_image" up_and_wait || {
        compose ps
        compose logs --tail 80 app || true
        fail "Сервисы не вышли в healthy за ${HEALTH_TIMEOUT}s"
    }

    # ⚠ Успех без пересоздания — это не успех. Docker пересоздаёт контейнер
    # только при смене конфигурации, а окружение — её часть. Совпадение
    # идентификаторов до и после означает ровно одно: правки не попали в тот
    # файл, который прочитал compose (частая причина — `nano .env.production`
    # из домашнего каталога создаёт ~/.env.production).
    if [[ "$(compose ps -q app 2>/dev/null || echo '')" == "$before_app" ]]; then
        log "⚠️  Контейнер app не пересоздан — окружение НЕ изменилось."
        log "    Проверьте, что редактировали именно $ENV_FILE"
        return 1
    fi
    log "=== ✅ Перезапущено, контейнер пересоздан ==="
}

### ── Статус ───────────────────────────────────────────────────────────────
cmd_status() {
    echo "Выкачено сейчас:"
    compose ps --format 'table {{.Service}}\t{{.Image}}\t{{.Status}}' 2>/dev/null || echo "  (стек не запущен)"
    echo
    echo "Последний успешный SHA: $(cat "$STATE_FILE" 2>/dev/null || echo '—')"
    echo "Предыдущий (цель --rollback): $(cat "$PREV_FILE" 2>/dev/null || echo '—')"
    echo "current -> $(readlink -f "$PROJECT_DIR/current" 2>/dev/null || echo '—')"
    echo "Доступные релизы:"
    { ls -1t "$PROJECT_DIR/releases" 2>/dev/null || true; } | head -5 | sed 's/^/  /' || echo "  (нет)"
    echo "Последние пред-выкладочные бэкапы:"
    { ls -1t "$BACKUP_DIR/pre-deploy" 2>/dev/null || true; } | head -4 | sed 's/^/  /' || echo "  (нет)"
}

### ── Основной сценарий ────────────────────────────────────────────────────
cmd_deploy() {
    : "${GIT_SHA:?GIT_SHA обязателен}"
    : "${REGISTRY:?REGISTRY обязателен}"
    : "${REPO:?REPO обязателен}"

    [[ -f "$ENV_FILE" ]] || fail "$ENV_FILE отсутствует"
    [[ -f "$COMPOSE_FILE" ]] || fail "$COMPOSE_FILE отсутствует"

    log "=== 🚀 Выкладка $GIT_SHA ==="
    log "Конфигурация: $RELEASE_DIR"

    local previous
    previous=$(cat "$STATE_FILE" 2>/dev/null || echo "")
    if [[ -n "$previous" ]]; then log "Предыдущий успешный SHA: $previous"; fi

    if [[ -n "${GHCR_TOKEN:-}" ]]; then
        echo "$GHCR_TOKEN" | docker login "$REGISTRY" -u "${GHCR_USER:-x}" --password-stdin >/dev/null \
            || fail "Не удалось войти в реестр $REGISTRY"
    fi

    # ── 1. Образы скачиваются ДО остановки чего-либо: если тега нет или
    #      реестр недоступен, выкладка прерывается, ничего не тронув.
    log "⬇️  Скачивание образов $GIT_SHA"
    docker pull "$(image_app "$GIT_SHA")"   || fail "Образ приложения не скачался"
    docker pull "$(image_tools "$GIT_SHA")" || fail "Образ инструментов не скачался"

    export IMAGE_APP="$(image_app "$GIT_SHA")"
    export IMAGE_TOOLS="$(image_tools "$GIT_SHA")"

    # ── 2. База поднимается и бэкапится до всего остального.
    log "🗄  Postgres и Redis"
    compose up -d --wait --wait-timeout 120 postgres redis \
        || fail "Postgres или Redis не поднялись"
    pre_deploy_backup

    # ── 3. Миграции — ДО подмены приложения. Одноразовый контейнер из образа
    #      tools; при неудаче работающее приложение остаётся прежним.
    log "🗃  Миграции Payload"
    # `--no-deps`: Postgres уже поднят и здоров шагом выше, повторно тянуть
    # зависимости незачем. Верхнего таймаута здесь нет намеренно — оборвать
    # миграцию на середине хуже, чем дождаться её: ограничение по времени
    # стоит снаружи, на job'е в workflow.
    if ! COMPOSE_PROFILES=tools compose run --rm --no-deps migrate; then
        fail "Миграции не применились — выкладка остановлена, работает прежняя версия"
    fi

    # ── 4. Запуск. Health-gate внутри `--wait`, затем проверка с хоста.
    log "🔄 Запуск сервисов"
    if ! up_and_wait || ! wait_host_port; then
        log "❌ Сервисы не вышли в рабочее состояние за ${HEALTH_TIMEOUT}s"
        compose ps
        compose logs --tail 100 app || true

        if [[ -n "$previous" ]]; then
            if rollback_to "$previous"; then
                fail "Выкладка $GIT_SHA не удалась — откачено на $previous"
            fi
            fail "Выкладка не удалась И откат не удался — нужен ручной вход на сервер"
        fi
        fail "Выкладка не удалась, откатываться не на что (первая выкладка?)"
    fi

    # ── 5. Успех фиксируется только после health-gate.
    if [[ -n "$previous" && "$previous" != "$GIT_SHA" ]]; then
        echo "$previous" > "$PREV_FILE"
    fi
    echo "$GIT_SHA" > "$STATE_FILE"
    echo "$REGISTRY" > "$STATE_DIR/registry"
    echo "$REPO"     > "$STATE_DIR/repo"
    ln -sfn "$RELEASE_DIR" "$PROJECT_DIR/current"
    log "✅ Выкачено: $GIT_SHA"

    # ── 6. Уборка. Только образы старше суток и только лишние релизы. Тома,
    #      build-кэш и «всё неиспользуемое» не трогаем никогда: `prune` без
    #      фильтра — это способ однажды удалить том с данными.
    docker image prune -f --filter "until=24h" >/dev/null 2>&1 || true
    find "$LOG_DIR" -maxdepth 1 -name 'deploy-*.log' -mtime "+${KEEP_LOG_DAYS}" -delete 2>/dev/null || true
    prune_releases

    log "=== ✅ Готово ==="
}

# Старые каталоги релизов удаляем, но НИКОГДА — текущий и предыдущий
# успешный: именно на них опирается автооткат.
prune_releases() {
    local keep_current keep_previous
    keep_current="$(basename "$RELEASE_DIR")"
    keep_previous="$(cat "$STATE_FILE" 2>/dev/null || echo '')"
    # shellcheck disable=SC2012
    { ls -1t "$PROJECT_DIR/releases" 2>/dev/null || true; } | tail -n "+$((KEEP_RELEASES + 1))" | while read -r old; do
        [[ "$old" == "$keep_current" || "$old" == "$keep_previous" ]] && continue
        rm -rf -- "${PROJECT_DIR:?}/releases/${old:?}"
        log "🗑  Удалён старый релиз: $old"
    done
}

### ── Точка входа ──────────────────────────────────────────────────────────
case "${1:-deploy}" in
    --status|status) cmd_status; exit 0 ;;
esac

# Замок берётся на всё, кроме статуса: две одновременные выкладки — это гонка
# за состоянием контейнеров, у которой нет хорошего исхода.
exec 200>"$LOCK_FILE"
flock -n 200 || fail "Выкладка уже идёт (замок $LOCK_FILE)"

case "${1:-deploy}" in
    deploy)     cmd_deploy ;;
    --restart)  cmd_restart ;;
    --rollback) rollback_to "$(cat "$PREV_FILE" 2>/dev/null || fail 'нет предыдущего успешного SHA — откатываться не на что')" ;;
    *)          fail "Неизвестная команда: $1" ;;
esac
