# Резервное копирование PostgreSQL (production)

Полноценная система бэкапов боевой базы `npo_polet` (PostgreSQL 17 в Docker).
Ежедневные автоматические дампы, недельная история, проверка целостности,
безопасная ротация и восстановление одной командой.

## Состав

| Файл | Назначение |
|------|-----------|
| `pg-backup.sh` | Снятие, проверка, публикация дампа + ротация |
| `pg-restore.sh` | Восстановление базы из бэкапа (с подтверждением) |
| `backup.env.example` | Пример конфигурации (копируется в `backup.env`) |
| `systemd/polet-backup.service` | systemd-сервис (oneshot), запускающий бэкап |
| `systemd/polet-backup.timer` | Таймер: ежедневный запуск |

## Что именно бэкапится

- **Основной дамп** `npo_polet-<timestamp>.dump` — `pg_dump -Fc` (custom-format):
  сжатый, поддерживает `pg_restore`, выборочное восстановление и параллелизм.
- **`.dump.sha256`** — контрольная сумма для проверки целостности.
- **`.globals.sql`** — роли и права (`pg_dumpall --globals-only`), чтобы можно
  было восстановиться даже на чистом сервере.

> Медиа-файлы (том `media_data`) в этот бэкап **не входят** — см. раздел «Медиа».

## Где лежат бэкапы

По умолчанию: **`/var/backups/polet-postgres/`** (вне git-дерева).
Права: каталог `700`, файлы `600`, владелец — пользователь бэкапа. Путь
переопределяется переменной `BACKUP_DIR` в `backup.env`.

---

## Установка на сервере (Ubuntu 22.04)

Выполняется один раз под пользователем `y4s` (при необходимости замените имя
пользователя и пути в `.service`).

```bash
cd /home/y4s/polet-next

# 1. (необязательно) своя конфигурация
cp scripts/backup/backup.env.example scripts/backup/backup.env
#   отредактируйте при необходимости; секретов там нет

# 2. Каталог для бэкапов с правильными правами
sudo mkdir -p /var/backups/polet-postgres
sudo chown y4s:y4s /var/backups/polet-postgres
sudo chmod 700 /var/backups/polet-postgres

# 3. Проверка вручную (см. раздел «Ручной бэкап»)
./scripts/backup/pg-backup.sh

# 4. Установка systemd-таймера
sudo cp scripts/backup/systemd/polet-backup.service /etc/systemd/system/
sudo cp scripts/backup/systemd/polet-backup.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now polet-backup.timer

# 5. Проверка расписания
systemctl list-timers polet-backup.timer
```

### Альтернатива: cron

Если systemd использовать не хочется:

```bash
crontab -e
# каждый день в 03:30
30 3 * * * /home/y4s/polet-next/scripts/backup/pg-backup.sh >> /home/y4s/polet-next/logs/cron-backup.log 2>&1
```

systemd предпочтительнее: `Persistent=true` выполнит пропущенный бэкап после
простоя сервера, а логи пишутся в journald.

---

## Как работает автоматизация

`polet-backup.timer` → ежедневно в **03:30** (±15 мин рандомизации) запускает
`polet-backup.service`, который вызывает `pg-backup.sh`. Алгоритм скрипта:

1. `flock` — защита от параллельных запусков.
2. Проверка, что контейнер Postgres запущен.
3. `pg_dump -Fc` во **временный** `.partial`-файл.
4. Проверки: код возврата `pg_dump`, минимальный размер, целостность через
   `pg_restore --list`. Любой провал → выход с ошибкой, **битый файл не
   публикуется**.
5. Атомарный `mv` в финальное имя, `chmod 600`, запись `.sha256`, дамп globals.
6. **Ротация** — оставить последние `KEEP=7`, удалить более старые.

### Гарантия «не удалить всё»

Ротация запускается **только после успешно проверенного нового бэкапа**.
Список сортируется от новых к старым, удаляются лишь элементы **начиная с
индекса 7** (`"${files[@]:KEEP}"`). Если файлов ≤ 7 — срез пустой, не удаляется
ничего. Дополнительно ротация отменяется при некорректном `BACKUP_DIR` или
`KEEP`. Массового `rm -rf` в коде нет — удаляются только совпавшие
`npo_polet-*.dump` и их спутники.

---

## Ручной бэкап (для проверки)

```bash
cd /home/y4s/polet-next
./scripts/backup/pg-backup.sh
ls -lh /var/backups/polet-postgres/
tail -n 30 logs/backup.log
```

Через systemd (как в проде, с логом в journald):

```bash
sudo systemctl start polet-backup.service
journalctl -u polet-backup.service -n 50 --no-pager
```

---

## Восстановление базы

```bash
# Список доступных бэкапов
./scripts/backup/pg-restore.sh --list

# Восстановить из ПОСЛЕДНЕГО бэкапа
./scripts/backup/pg-restore.sh

# Восстановить из конкретного файла
./scripts/backup/pg-restore.sh npo_polet-20260719_033000.dump
```

Скрипт: сверяет sha256 → проверяет целостность архива → запрашивает `YES` →
восстанавливает через `pg_restore --clean --if-exists --no-owner
--single-transaction`. `--single-transaction` означает, что при ошибке всё
откатывается и база остаётся консистентной.

Для скриптов/автоматизации подтверждение можно пропустить: `FORCE=1 ...`.

### План действий при падении базы (DR)

1. **Оцените ситуацию.** Контейнер жив? `docker ps -a | grep postgres`,
   логи: `docker logs polet-next-postgres-prod --tail 100`.
2. **Остановите запись**, чтобы приложение не мешало восстановлению:
   ```bash
   docker stop polet-next-app-prod polet-next-account-deletion-worker-prod
   ```
3. **Если контейнер/том БД целы** — восстановите поверх:
   ```bash
   ./scripts/backup/pg-restore.sh
   ```
4. **Если том с данными потерян** — поднимите чистый Postgres, затем при
   необходимости примените роли и восстановите данные:
   ```bash
   docker compose -p polet-next -f docker-compose.prod.yml up -d postgres
   # роли/права (если восстанавливаете на чистом кластере):
   cat /var/backups/polet-postgres/npo_polet-<ts>.globals.sql \
     | docker exec -i polet-next-postgres-prod psql -U npo_user -d postgres
   # данные:
   ./scripts/backup/pg-restore.sh npo_polet-<ts>.dump
   ```
5. **Запустите приложение и миграции:**
   ```bash
   cd /home/y4s/polet-next
   docker compose -p polet-next -f docker-compose.prod.yml up -d
   curl -sf http://127.0.0.1:3004/api/health && echo OK
   ```

### Как убедиться, что бэкап действительно рабочий

Лучшая проверка — тестовое восстановление в отдельную базу (данные прода не
трогаются):

```bash
# 1. Создать временную базу
docker exec -e PGPASSWORD="$PGPASSWORD" polet-next-postgres-prod \
  createdb -U npo_user restore_test

# 2. Восстановить в неё последний бэкап
LATEST=$(ls -t /var/backups/polet-postgres/npo_polet-*.dump | head -1)
docker exec -i polet-next-postgres-prod \
  pg_restore -U npo_user -d restore_test --no-owner --exit-on-error < "$LATEST"

# 3. Проверить, что данные на месте
docker exec polet-next-postgres-prod \
  psql -U npo_user -d restore_test -c "\dt" -c "SELECT count(*) FROM users;"

# 4. Удалить временную базу
docker exec polet-next-postgres-prod dropdb -U npo_user restore_test
```

Рекомендуется прогонять такую проверку раз в месяц.

---

## Мониторинг и логи

- **Лог скрипта:** `logs/backup.log` (в корне проекта).
- **journald:** `journalctl -u polet-backup.service` (при запуске через systemd).
- **Расписание:** `systemctl list-timers polet-backup.timer`.
- **Свежесть:** последний файл в `/var/backups/polet-postgres/` должен быть не
  старше суток; следите за отметкой времени в имени.

---

## Рекомендации по надёжности (следующий шаг)

- **Офсайт-копия.** Локальные бэкапы не спасают от гибели VPS. Настройте
  ежедневную выгрузку `/var/backups/polet-postgres/` в S3-совместимое хранилище
  (`rclone`/`restic`) или на другой сервер. Правило 3-2-1.
- **Медиа.** Загруженные файлы лежат в томе `media_data`. Их стоит бэкапить
  отдельно, например:
  ```bash
  docker run --rm -v polet-next_media_data:/data:ro -v /var/backups/polet-media:/out \
    alpine tar czf /out/media-$(date +%F).tar.gz -C /data .
  ```
- **Уведомления.** Добавьте отправку алерта (email/Telegram) при провале
  `polet-backup.service` через `OnFailure=`-юнит systemd.
