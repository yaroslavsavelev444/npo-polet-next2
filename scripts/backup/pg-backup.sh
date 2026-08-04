#!/usr/bin/env bash
#
# pg-backup.sh — production-бэкап PostgreSQL для NPO Polet.
#
# Что делает:
#   1. Снимает полный дамп базы `npo_polet` в custom-формате (pg_dump -Fc):
#      сжатый, пригодный для pg_restore, поддерживает выборочное восстановление.
#   2. Дополнительно сохраняет globals (роли/права) через pg_dumpall --globals-only,
#      чтобы восстановление было полноценным даже на чистом сервере.
#   3. Пишет во ВРЕМЕННЫЙ файл, проверяет его и только потом атомарно перемещает
#      в каталог бэкапов — так в каталоге никогда не появится битый/пустой архив.
#   4. Проверяет успех: код возврата pg_dump, минимальный размер и целостность
#      архива (pg_restore --list читает оглавление — падает на повреждённом файле).
#   5. Считает sha256 и кладёт рядом .sha256 для контроля целостности.
#   6. Ротация: оставляет последние KEEP успешных бэкапов, удаляет более старые.
#      Ротация выполняется ТОЛЬКО после успешного нового бэкапа и устроена так,
#      что физически не может удалить все копии (см. rotate_backups).
#
# Запуск: вручную `./scripts/backup/pg-backup.sh` или из systemd-таймера.
#
set -Eeuo pipefail

### ── КОНФИГУРАЦИЯ ─────────────────────────────────────────────────────────
# Значения по умолчанию рассчитаны на прод-сервер. Любую переменную можно
# переопределить через файл окружения (BACKUP_CONFIG) или экспортом до запуска.
PROJECT_DIR="${PROJECT_DIR:-/home/y4s/polet-next}"
ENV_FILE="${ENV_FILE:-$PROJECT_DIR/.env.production}"

# Контейнер и параметры БД (совпадают с docker-compose.prod.yml).
CONTAINER="${PG_CONTAINER:-polet-next-postgres-prod}"
DB_NAME="${PG_DB:-npo_polet}"
DB_USER="${PG_USER:-npo_user}"

# Каталог хранения бэкапов (вне git-дерева проекта).
BACKUP_DIR="${BACKUP_DIR:-/var/backups/polet-postgres}"

# Сколько последних успешных бэкапов хранить (недельная история = 7).
KEEP="${BACKUP_KEEP:-7}"

# Минимально допустимый размер дампа в байтах. Меньше — считаем архив битым.
MIN_BYTES="${BACKUP_MIN_BYTES:-1000}"

# Логи.
LOG_DIR="${BACKUP_LOG_DIR:-$PROJECT_DIR/logs}"
LOG_FILE="${BACKUP_LOG_FILE:-$LOG_DIR/backup.log}"

# Блокировка от параллельных запусков.
LOCK_FILE="${BACKUP_LOCK_FILE:-/tmp/polet-pg-backup.lock}"

# Необязательный файл окружения с переопределениями (не коммитится).
BACKUP_CONFIG="${BACKUP_CONFIG:-$PROJECT_DIR/scripts/backup/backup.env}"
[[ -f "$BACKUP_CONFIG" ]] && source "$BACKUP_CONFIG"

### ── СЛУЖЕБНОЕ ────────────────────────────────────────────────────────────
mkdir -p "$LOG_DIR"

log()  { echo "[$(date '+%F %T')] $*" | tee -a "$LOG_FILE"; }
fail() { log "❌ ОШИБКА: $*"; exit 1; }

# Временный файл дампа; чистим при любом выходе.
TMP_FILE=""
cleanup() {
  if [[ -n "$TMP_FILE" && -f "$TMP_FILE" ]]; then
    rm -f -- "$TMP_FILE"
  fi
  return 0
}
trap cleanup EXIT
trap 'fail "Прервано на непредвиденной ошибке (строка $LINENO)"' ERR

# Читает значение переменной из env-файла (последнее вхождение), без утечки в лог.
read_env_var() {
  local key="$1" file="$2" line
  [[ -f "$file" ]] || return 0
  line=$(grep -E "^[[:space:]]*${key}=" "$file" | tail -n1 || true)
  line="${line#*=}"
  # снимаем обрамляющие кавычки, если есть
  line="${line%\"}"; line="${line#\"}"
  line="${line%\'}"; line="${line#\'}"
  printf '%s' "$line"
}

### ── БЛОКИРОВКА ───────────────────────────────────────────────────────────
exec 200>"$LOCK_FILE"
flock -n 200 || fail "Другой бэкап уже выполняется (lock: $LOCK_FILE)"

log "=== 🗄  Бэкап PostgreSQL начат ==="

### ── ПРЕДПРОВЕРКИ ─────────────────────────────────────────────────────────
command -v docker >/dev/null || fail "docker не установлен"

docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true \
  || fail "Контейнер $CONTAINER не запущен — нечего бэкапить"

# Пароль берём из env-файла (чувствительные данные не хардкодим).
# На локальном сокете внутри контейнера обычно trust, но PGPASSWORD не мешает.
PGPASSWORD_VALUE="$(read_env_var POSTGRES_PASSWORD "$ENV_FILE")"

mkdir -p "$BACKUP_DIR"
# Каталог бэкапов доступен только владельцу.
chmod 700 "$BACKUP_DIR" 2>/dev/null || true

TIMESTAMP="$(date '+%Y%m%d_%H%M%S')"
BASENAME="npo_polet-${TIMESTAMP}"
DEST_FILE="$BACKUP_DIR/${BASENAME}.dump"
GLOBALS_FILE="$BACKUP_DIR/${BASENAME}.globals.sql"
TMP_FILE="$BACKUP_DIR/.${BASENAME}.dump.partial"

### ── СНЯТИЕ ДАМПА ─────────────────────────────────────────────────────────
log "Снятие дампа базы '$DB_NAME' из контейнера '$CONTAINER'..."

# Дамп в custom-формате пишем сначала во временный .partial-файл.
# Проверка pipefail + явный код возврата гарантируют, что оборванный дамп
# не будет принят за успешный.
if ! docker exec -e PGPASSWORD="$PGPASSWORD_VALUE" "$CONTAINER" \
      pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc --no-password \
      > "$TMP_FILE" 2>>"$LOG_FILE"; then
  fail "pg_dump завершился с ошибкой (см. $LOG_FILE)"
fi

### ── ПРОВЕРКА АРХИВА ──────────────────────────────────────────────────────
# 1) Непустой и не меньше минимального размера.
SIZE_BYTES="$(stat -c%s "$TMP_FILE" 2>/dev/null || stat -f%z "$TMP_FILE")"
if [[ "$SIZE_BYTES" -lt "$MIN_BYTES" ]]; then
  fail "Дамп подозрительно мал (${SIZE_BYTES} байт < ${MIN_BYTES}) — считаем битым"
fi

# 2) Целостность: pg_restore --list читает оглавление архива и падает,
#    если файл повреждён или это не валидный custom-format дамп.
if ! docker exec -i "$CONTAINER" pg_restore --list < "$TMP_FILE" >/dev/null 2>>"$LOG_FILE"; then
  fail "Архив не прошёл проверку целостности (pg_restore --list) — не публикуем"
fi

log "✅ Дамп прошёл проверки (размер: $(numfmt --to=iec "$SIZE_BYTES" 2>/dev/null || echo "${SIZE_BYTES}B"))"

### ── АТОМАРНАЯ ПУБЛИКАЦИЯ ─────────────────────────────────────────────────
# Перемещаем в финальное имя только полностью проверенный файл.
mv -f -- "$TMP_FILE" "$DEST_FILE"
TMP_FILE=""   # чтобы cleanup не удалил уже опубликованный файл
chmod 600 "$DEST_FILE"

# Контрольная сумма рядом.
if command -v sha256sum >/dev/null 2>&1; then
  ( cd "$BACKUP_DIR" && sha256sum "${BASENAME}.dump" > "${BASENAME}.dump.sha256" )
  chmod 600 "$DEST_FILE.sha256"
fi

# Globals (роли/права) — некритично, поэтому не валим весь бэкап при сбое.
if docker exec -e PGPASSWORD="$PGPASSWORD_VALUE" "$CONTAINER" \
     pg_dumpall -U "$DB_USER" --globals-only --no-password \
     > "$GLOBALS_FILE" 2>>"$LOG_FILE"; then
  chmod 600 "$GLOBALS_FILE"
  log "✅ Globals сохранены: $(basename "$GLOBALS_FILE")"
else
  log "⚠️  Не удалось снять globals (роли/права) — основной дамп это не затрагивает"
  rm -f -- "$GLOBALS_FILE"
fi

log "✅ Бэкап опубликован: $DEST_FILE"

### ── РОТАЦИЯ ──────────────────────────────────────────────────────────────
rotate_backups() {
  # Жёсткие предохранители: без валидного каталога ничего не трогаем.
  [[ -n "$BACKUP_DIR" && -d "$BACKUP_DIR" ]] || { log "⚠️  Ротация пропущена: некорректный BACKUP_DIR"; return 0; }
  [[ "$KEEP" =~ ^[0-9]+$ && "$KEEP" -ge 1 ]] || { log "⚠️  Ротация пропущена: некорректный KEEP='$KEEP'"; return 0; }

  # Список .dump-файлов, новые сверху (по времени модификации).
  local files=()
  while IFS= read -r -d '' f; do
    files+=("$f")
  done < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'npo_polet-*.dump' -printf '%T@\t%p\0' \
           | sort -zrn | cut -z -f2-)

  local total="${#files[@]}"
  log "Ротация: найдено успешных бэкапов — $total, хранить — $KEEP"

  # Если копий не больше лимита — удалять НЕЧЕГО. Это же условие защищает
  # от удаления всех копий: срез ниже начинается строго с индекса KEEP.
  if (( total <= KEEP )); then
    log "Ротация: удалять нечего"
    return 0
  fi

  local victim base
  for victim in "${files[@]:KEEP}"; do
    base="${victim%.dump}"
    rm -f -- "$victim" "${base}.dump.sha256" "${base}.globals.sql"
    log "🗑  Удалён старый бэкап: $(basename "$victim")"
  done
}

rotate_backups

log "=== ✅ Бэкап PostgreSQL завершён успешно ==="
exit 0
