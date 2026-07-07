#!/usr/bin/env bash
set -Eeuo pipefail

### ── CONFIG ──────────────────────────────────────────────────────────────
PROJECT_DIR="/var/www/npo-polet-next2"
BRANCH="main"
COMPOSE_FILE="docker-compose.prod.yml"
COMPOSE_PROJECT="npo-polet-next2"
HEALTH_URL="http://127.0.0.1:3004/api/health"
MAX_WAIT=120
SLEEP=3
LOG_FILE="/var/log/npo-polet-deploy.log"
LOCK_FILE="/tmp/npo-polet-deploy.lock"
STATE_FILE="$PROJECT_DIR/.last_successful_commit"
KEEP_IMAGES=3

exec > >(tee -a "$LOG_FILE") 2>&1

log()  { echo "[$(date '+%F %T')] $*"; }
fail() { log "❌ ERROR: $*"; exit 1; }

# ── Не даём запустить деплой параллельно ────────────────────────────────────
exec 200>"$LOCK_FILE"
flock -n 200 || fail "Другой деплой уже выполняется (lock: $LOCK_FILE)"

cd "$PROJECT_DIR" || fail "Директория проекта не найдена: $PROJECT_DIR"

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

rollback() {
    log "🔙 Запуск автоматического отката..."
    if [[ ! -f "$STATE_FILE" ]]; then
        log "⚠️  Нет сохранённого предыдущего успешного коммита — откат невозможен, требуется ручное вмешательство."
        exit 1
    fi
    local prev
    prev=$(cat "$STATE_FILE")
    log "Откатываемся на коммит: $prev"
    git reset --hard "$prev"
    export IMAGE_TAG="$prev"

    docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" up -d --build app \
        || { log "❌ Откат не удался — нужна ручная проверка!"; exit 1; }

    if wait_for_ready; then
        log "✅ Откат выполнен успешно, приложение на коммите $prev"
    else
        log "❌ После отката приложение всё ещё не отвечает — критично, нужен ручной вход на сервер"
    fi
    exit 1
}

trap 'log "❌ Деплой прерван на непредвиденной ошибке (строка $LINENO)"; rollback' ERR

log "=== 🚀 Деплой начат ==="

### PRE-CHECKS
command -v docker >/dev/null || fail "docker не установлен"
command -v git    >/dev/null || fail "git не установлен"
command -v curl   >/dev/null || fail "curl не установлен"
[[ -f .env.production ]] || fail ".env.production отсутствует"

CURRENT_COMMIT=$(git rev-parse HEAD)
log "Текущий коммит: $CURRENT_COMMIT"

log "Получение обновлений из origin/$BRANCH..."
git fetch origin "$BRANCH"
NEW_COMMIT=$(git rev-parse "origin/$BRANCH")

if [[ "$CURRENT_COMMIT" == "$NEW_COMMIT" && "${FORCE:-0}" != "1" ]]; then
    log "Изменений нет. Деплой пропущен (используйте FORCE=1 ./deploy.sh для принудительного передеплоя)."
    exit 0
fi

log "Новый коммит: $NEW_COMMIT"

# Сохраняем текущий коммит как точку отката ДО обновления кода
echo "$CURRENT_COMMIT" > "$STATE_FILE.rollback_candidate"

git reset --hard "$NEW_COMMIT"

export IMAGE_TAG="$NEW_COMMIT"
log "Сборка образа с тегом: $IMAGE_TAG"
docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" build app \
    || fail "Сборка Docker-образа не удалась"

log "Применение миграций Payload/Postgres..."
docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" run --rm app \
    node_modules/.bin/payload migrate \
    || fail "Миграции не применились — деплой остановлен ДО переключения трафика"

log "Запуск обновлённых контейнеров..."
docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" up -d --remove-orphans \
    || fail "docker compose up не удался"

if wait_for_ready; then
    log "✅ Деплой успешен"
    mv "$STATE_FILE.rollback_candidate" "$STATE_FILE" 2>/dev/null || echo "$CURRENT_COMMIT" > "$STATE_FILE"
    # На следующий цикл — если этот деплой успешен, следующая точка отката — этот коммит
    echo "$NEW_COMMIT" > "$STATE_FILE"
else
    fail "Приложение не ответило за ${MAX_WAIT}s после деплоя"
fi

log "Очистка старых образов (оставляем последние $KEEP_IMAGES)..."
docker images "npo-polet-next2" --format '{{.Tag}} {{.ID}}' \
    | grep -v latest \
    | sort -r \
    | tail -n +$((KEEP_IMAGES + 1)) \
    | awk '{print $2}' \
    | xargs -r docker rmi -f 2>/dev/null || true
docker image prune -f --filter "until=48h" >/dev/null || true

log "=== ✅ Деплой завершён успешно: $(date) ==="
exit 0