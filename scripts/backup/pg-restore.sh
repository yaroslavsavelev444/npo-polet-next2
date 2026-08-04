#!/usr/bin/env bash
#
# pg-restore.sh — восстановление базы `npo_polet` из бэкапа, снятого pg-backup.sh.
#
# ВНИМАНИЕ: операция РАЗРУШАЮЩАЯ — существующие данные в базе будут заменены
# содержимым дампа (pg_restore --clean --if-exists). Требует явного подтверждения.
#
# Использование:
#   ./scripts/backup/pg-restore.sh                 # восстановить из последнего бэкапа
#   ./scripts/backup/pg-restore.sh <файл.dump>     # из конкретного файла
#   ./scripts/backup/pg-restore.sh --list          # показать доступные бэкапы
#   FORCE=1 ./scripts/backup/pg-restore.sh <файл>  # без интерактивного подтверждения
#
set -Eeuo pipefail

### ── КОНФИГУРАЦИЯ (совпадает с pg-backup.sh) ──────────────────────────────
PROJECT_DIR="${PROJECT_DIR:-/home/y4s/polet-next}"
ENV_FILE="${ENV_FILE:-$PROJECT_DIR/.env.production}"
CONTAINER="${PG_CONTAINER:-polet-next-postgres-prod}"
DB_NAME="${PG_DB:-npo_polet}"
DB_USER="${PG_USER:-npo_user}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/polet-postgres}"
BACKUP_CONFIG="${BACKUP_CONFIG:-$PROJECT_DIR/scripts/backup/backup.env}"
[[ -f "$BACKUP_CONFIG" ]] && source "$BACKUP_CONFIG"

log()  { echo "[$(date '+%F %T')] $*"; }
fail() { echo "❌ ОШИБКА: $*" >&2; exit 1; }

read_env_var() {
  local key="$1" file="$2" line
  [[ -f "$file" ]] || return 0
  line=$(grep -E "^[[:space:]]*${key}=" "$file" | tail -n1 || true)
  line="${line#*=}"; line="${line%\"}"; line="${line#\"}"; line="${line%\'}"; line="${line#\'}"
  printf '%s' "$line"
}

list_backups() {
  echo "Доступные бэкапы в $BACKUP_DIR:"
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'npo_polet-*.dump' -printf '%TY-%Tm-%Td %TH:%TM  %10s байт  %p\n' \
    2>/dev/null | sort -r || echo "  (пусто)"
}

latest_backup() {
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'npo_polet-*.dump' -printf '%T@\t%p\n' 2>/dev/null \
    | sort -rn | head -n1 | cut -f2-
}

### ── РАЗБОР АРГУМЕНТОВ ────────────────────────────────────────────────────
if [[ "${1:-}" == "--list" ]]; then
  list_backups
  exit 0
fi

BACKUP_FILE="${1:-}"
if [[ -z "$BACKUP_FILE" ]]; then
  BACKUP_FILE="$(latest_backup)"
  [[ -n "$BACKUP_FILE" ]] || fail "В $BACKUP_DIR нет ни одного бэкапа"
  log "Файл не указан — берём последний: $BACKUP_FILE"
fi

# Если передали относительное имя — ищем в каталоге бэкапов.
[[ -f "$BACKUP_FILE" ]] || BACKUP_FILE="$BACKUP_DIR/$BACKUP_FILE"
[[ -f "$BACKUP_FILE" ]] || fail "Файл бэкапа не найден: $BACKUP_FILE"

### ── ПРЕДПРОВЕРКИ ─────────────────────────────────────────────────────────
command -v docker >/dev/null || fail "docker не установлен"
docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true \
  || fail "Контейнер $CONTAINER не запущен"

# Сверяем контрольную сумму, если она есть рядом.
if [[ -f "$BACKUP_FILE.sha256" ]] && command -v sha256sum >/dev/null 2>&1; then
  log "Проверка sha256..."
  ( cd "$(dirname "$BACKUP_FILE")" && sha256sum -c "$(basename "$BACKUP_FILE").sha256" ) \
    || fail "Контрольная сумма НЕ совпала — файл повреждён, восстановление отменено"
fi

# Проверяем, что архив читается (валидный custom-format).
log "Проверка целостности архива..."
docker exec -i "$CONTAINER" pg_restore --list - < "$BACKUP_FILE" >/dev/null \
  || fail "Архив повреждён или не является дампом pg_dump -Fc"
log "✅ Архив валиден"

### ── ПОДТВЕРЖДЕНИЕ ────────────────────────────────────────────────────────
echo
echo "  Будет ВОССТАНОВЛЕНА база '$DB_NAME' в контейнере '$CONTAINER'"
echo "  из файла: $BACKUP_FILE"
echo "  Текущие данные базы будут ЗАМЕНЕНЫ (--clean --if-exists)."
echo
if [[ "${FORCE:-0}" != "1" ]]; then
  read -r -p "Введите 'YES' для продолжения: " answer
  [[ "$answer" == "YES" ]] || { echo "Отменено."; exit 1; }
fi

### ── ВОССТАНОВЛЕНИЕ ───────────────────────────────────────────────────────
PGPASSWORD_VALUE="$(read_env_var POSTGRES_PASSWORD "$ENV_FILE")"

log "Рекомендация: остановите приложение, чтобы избежать записи во время восстановления:"
log "  docker stop polet-next-app-prod polet-next-account-deletion-worker-prod"
log "Начинаем восстановление..."

# --clean --if-exists  — удаляет существующие объекты перед созданием (идемпотентно);
# --no-owner           — назначит объекты текущему юзеру (npo_user);
# --exit-on-error      — падаем на первой реальной ошибке;
# --single-transaction — всё в одной транзакции: при сбое БД остаётся консистентной.
if docker exec -i -e PGPASSWORD="$PGPASSWORD_VALUE" "$CONTAINER" \
     pg_restore -U "$DB_USER" -d "$DB_NAME" \
       --clean --if-exists --no-owner --no-password \
       --exit-on-error --single-transaction \
     < "$BACKUP_FILE"; then
  log "✅ База '$DB_NAME' успешно восстановлена из $(basename "$BACKUP_FILE")"
else
  fail "Восстановление завершилось с ошибкой. Транзакция откачена — база не изменена."
fi

log "Не забудьте снова запустить приложение:"
log "  cd $PROJECT_DIR && docker compose -p polet-next -f docker-compose.prod.yml up -d"
exit 0
