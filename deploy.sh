#!/usr/bin/env bash
set -Eeuo pipefail

### ── CONFIG ──────────────────────────────────────────────────────────────
PROJECT_DIR="/home/y4s/polet-next"
BRANCH="master"
COMPOSE_FILE="docker-compose.prod.yml"
COMPOSE_PROJECT="polet-next"
ENV_FILE=".env.production"
HEALTH_URL="http://127.0.0.1:3004/api/health"
MAX_WAIT=120
SLEEP=3
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/deploy.log"
LOCK_FILE="/tmp/polet-next-deploy.lock"
STATE_FILE="$PROJECT_DIR/.last_successful_commit"
KEEP_IMAGES=3

mkdir -p "$LOG_DIR"
exec > >(tee -a "$LOG_FILE") 2>&1

log()  { echo "[$(date '+%F %T')] $*"; }
fail() { log "❌ ERROR: $*"; exit 1; }

exec 200>"$LOCK_FILE"
flock -n 200 || fail "Другой деплой уже выполняется (lock: $LOCK_FILE)"

cd "$PROJECT_DIR" || fail "Директория проекта не найдена: $PROJECT_DIR"

# Критическая правка: --env-file прокидывается ЯВНО в каждый вызов compose.
# Без этого Compose не подставит ${POSTGRES_PASSWORD}/${DATABASE_URI}/${PAYLOAD_SECRET}
# в сам YAML (build args, environment, image) — только внутрь контейнера через
# env_file:, а это разные механизмы. Отсюда были варнинги "variable is not set".
compose() {
  docker compose --env-file "$ENV_FILE" -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" "$@"
}

wait_for_ready() {
    local start elapsed
    start=$(date +%s)
    log "Ожидание готовности приложения: $HEALTH_URL"
    while true; do
        if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
            log "✅ Приложение отвечает"
            return 0
        fi
        elapsed=$(( $(date +%s) - start ))
        [[ "$elapsed" -ge "$MAX_WAIT" ]] && { log "⏱ Таймаут ожидания (${elapsed}s)"; return 1; }
        sleep "$SLEEP"
    done
}

wait_for_postgres() {
    local start elapsed
    start=$(date +%s)
    log "Ожидание готовности Postgres..."
    while true; do
        if compose exec -T postgres pg_isready -U npo_user -d npo_polet >/dev/null 2>&1; then
            log "✅ Postgres готов"
            return 0
        fi
        elapsed=$(( $(date +%s) - start ))
        [[ "$elapsed" -ge 60 ]] && { log "⏱ Postgres не поднялся за 60s"; return 1; }
        sleep 2
    done
}

rollback() {
    log "🔙 Запуск автоматического отката..."
    if [[ ! -f "$STATE_FILE" ]]; then
        log "⚠️  Нет сохранённого предыдущего успешного коммита — откат невозможен."
        exit 1
    fi
    local prev
    prev=$(cat "$STATE_FILE")
    log "Откатываемся на коммит: $prev"
    git reset --hard "$prev"
    export IMAGE_TAG="$prev"

    compose build app || { log "❌ Откат: сборка не удалась"; exit 1; }
    compose up -d app --remove-orphans || { log "❌ Откат: запуск не удался"; exit 1; }

    if wait_for_ready; then
        log "✅ Откат выполнен успешно, приложение на коммите $prev"
    else
        log "❌ После отката приложение всё ещё не отвечает — нужен ручной вход на сервер"
    fi
    exit 1
}

trap 'log "❌ Деплой прерван на непредвиденной ошибке (строка $LINENO)"; rollback' ERR

log "=== 🚀 Деплой начат ==="

### PRE-CHECKS
command -v docker >/dev/null || fail "docker не установлен"
command -v git    >/dev/null || fail "git не установлен"
command -v curl   >/dev/null || fail "curl не установлен"
[[ -f "$ENV_FILE" ]] || fail "$ENV_FILE отсутствует"

CURRENT_COMMIT=$(git rev-parse HEAD)
log "Текущий коммит: $CURRENT_COMMIT"

log "Получение обновлений из origin/$BRANCH..."
# git fetch по HTTPS время от времени падает на транзиентных сетевых сбоях
# (например "gnutls_handshake() failed" при рукопожатии с GitHub) — сам по
# себе не признак проблемы с кодом, но без ретрая любой такой блип уводит
# весь деплой в откат. Три попытки с паузой отличают реальную недоступность
# от разовой сетевой заминки.
fetch_ok=0
for attempt in 1 2 3; do
    if git fetch origin "$BRANCH"; then
        fetch_ok=1
        break
    fi
    log "⚠️  git fetch не удался (попытка $attempt/3), повтор через 5с..."
    sleep 5
done
[[ "$fetch_ok" == "1" ]] || fail "git fetch origin $BRANCH не удался после 3 попыток"
NEW_COMMIT=$(git rev-parse "origin/$BRANCH")

if [[ "$CURRENT_COMMIT" == "$NEW_COMMIT" && "${FORCE:-0}" != "1" ]]; then
    log "Изменений нет. Деплой пропущен (FORCE=1 ./deploy.sh для принудительного передеплоя)."
    exit 0
fi

log "Новый коммит: $NEW_COMMIT"
echo "$CURRENT_COMMIT" > "$STATE_FILE.rollback_candidate"
git reset --hard "$NEW_COMMIT"
export IMAGE_TAG="$NEW_COMMIT"

log "Поднятие Postgres и Redis..."
compose up -d postgres redis
wait_for_postgres || fail "Postgres недоступен — деплой остановлен ДО любых миграций/сборки"

log "Проверка графа импортов payload.config.ts (guard script)..."
compose --profile tools build migrate || fail "Не удалось собрать образ для миграций/guard"
compose --profile tools run --rm --entrypoint node migrate scripts/verify-payload-graph.mjs \
  || fail "payload.config.ts граф невалиден — сборка остановлена до миграций"

log "Применение миграций Payload..."
compose --profile tools run --rm migrate || fail "Миграции не применились — деплой остановлен ДО сборки приложения"

log "Сборка образа приложения с тегом: $IMAGE_TAG"
compose build app || fail "Сборка Docker-образа приложения не удалась"

log "Запуск обновлённого контейнера приложения..."
compose up -d app --remove-orphans || fail "docker compose up не удался"

if wait_for_ready; then
    log "✅ Деплой успешен"
    mv "$STATE_FILE.rollback_candidate" "$STATE_FILE" 2>/dev/null || true
    echo "$NEW_COMMIT" > "$STATE_FILE"
else
    fail "Приложение не ответило за ${MAX_WAIT}s после деплоя"
fi

log "Очистка старых образов (оставляем последние $KEEP_IMAGES)..."
docker images "polet-next" --format '{{.Tag}} {{.ID}}' \
    | grep -v latest | sort -r | tail -n +$((KEEP_IMAGES + 1)) \
    | awk '{print $2}' | xargs -r docker rmi -f 2>/dev/null || true
docker image prune -f --filter "until=48h" >/dev/null || true

log "=== ✅ Деплой завершён успешно: $(date) ==="
exit 0