# Выкладка polet-next

Полная инструкция по настройке и эксплуатации боевого деплоя.

---

## Как это работает

```
push в master
   │
   ├─ CI (.github/workflows/ci.yml) ── типы, guard графа, тесты
   │
   └─ Deploy (.github/workflows/deploy.yml)
        ├─ verify  ── те же проверки ещё раз (workflow_dispatch тоже проходит барьер)
        ├─ build   ── два образа → ghcr.io, тег = SHA коммита
        ├─ deploy  ── ssh: конфигурация архивом в releases/<sha>/, затем deploy.sh
        │              └─ pull образов → дамп БД + архив медиа → миграции
        │                 → up -d --wait → при неудаче автооткат
        └─ smoke   ── проверка снаружи: https://npo-polet.ru и /api/health
```

Собирается **два** образа:

| Образ | Таргет Dockerfile | Зачем |
|---|---|---|
| `ghcr.io/<owner>/<repo>-app:<sha>` | `runner` | боевое приложение (Next.js standalone) |
| `ghcr.io/<owner>/<repo>-tools:<sha>` | `tools` | миграции Payload и фоновые воркеры (нужен весь `src/` и `node_modules`) |

**На VPS не нужны:** git, доступ к приватному репозиторию, Node.js, pnpm, buildx,
исходный код. Только Docker и `.env.production`.

---

## Что лежит на сервере

```
/home/y4s/polet-next/
├── .env.production            ← секреты. НЕ перезаписывается выкладкой, правится руками
├── .deploy-state/
│   ├── last_successful_sha    ← что выкачено сейчас
│   └── previous_successful_sha← цель для --rollback
├── releases/<sha>/            ← конфигурация конкретной выкладки (приезжает по SSH)
│   ├── docker-compose.prod.yml
│   ├── deploy/
│   └── scripts/backup/
├── current -> releases/<sha>  ← симлинк на работающую версию
└── logs/deploy-*.log
```

Бэкапы — вне каталога проекта: `/var/backups/polet-next/pre-deploy/`
(пред-выкладочные) и `/var/backups/polet-postgres/` (ночные, ставились раньше).

---

## Первоначальная настройка

### 1. Подготовка VPS

Всё уже установлено — Docker 29.4.1 и Compose v5.1.0 стоят, пользователь `y4s`
в группе `docker`. Нужен один каталог:

```
[VPS]
sudo mkdir -p /var/backups/polet-next
sudo chown y4s:y4s /var/backups/polet-next
sudo chmod 700 /var/backups/polet-next
```

Проверить, что доступ к реестру есть (401 — это правильный ответ, значит
GHCR отвечает; ошибка сети выглядит иначе):

```
[VPS]
curl -s -o /dev/null -w '%{http_code}\n' https://ghcr.io/v2/
```

Остальное (`releases/`, `logs/`, `.deploy-state/`) создаёт сам `deploy.sh`.

### 2. SSH-ключ для GitHub Actions

Ключ должен существовать **только** в двух местах: приватная половина — в
GitHub Secrets, публичная — в `authorized_keys` на сервере. Держать приватную
половину на самом сервере не нужно (сейчас там лежит
`~/.ssh/github_actions_polet_next` — после перехода его можно удалить).

Генерируем **на своей машине**, а не на сервере: приватный ключ не должен
оказаться на машине, доступ к которой он открывает.

```
[LOCAL]
ssh-keygen -t ed25519 -a 100 -C "github-actions-polet-next" -N "" -f ~/.ssh/polet_deploy_ed25519
chmod 600 ~/.ssh/polet_deploy_ed25519
chmod 644 ~/.ssh/polet_deploy_ed25519.pub
```

Публичную половину — на сервер:

```
[LOCAL]
ssh-copy-id -i ~/.ssh/polet_deploy_ed25519.pub -p 48965 y4s@<АДРЕС_СЕРВЕРА>
```

Если `ssh-copy-id` недоступен — то же самое вручную:

```
[LOCAL]
cat ~/.ssh/polet_deploy_ed25519.pub
```

```
[VPS]
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo '<вставить содержимое .pub одной строкой>' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Проверяем, что ключ работает и пароль не спрашивается:

```
[LOCAL]
ssh -i ~/.ssh/polet_deploy_ed25519 -p 48965 -o BatchMode=yes y4s@<АДРЕС_СЕРВЕРА> 'whoami; docker ps --format "{{.Names}}"'
```

Должно вывести `y4s` и список контейнеров. `BatchMode=yes` здесь принципиален:
он запрещает любой интерактив, поэтому проверка отвечает на тот же вопрос, что
и GitHub Actions, а не «а если я введу пароль».

Приватную половину — в секрет (см. §4). Вывести целиком, вместе со строками
`-----BEGIN`/`-----END`:

```
[LOCAL]
cat ~/.ssh/polet_deploy_ed25519
```

### 3. Отпечаток сервера (known_hosts)

Без него остаётся только `StrictHostKeyChecking=no`, то есть выкладка пойдёт
на любой сервер, который окажется по этому адресу.

```
[LOCAL]
ssh-keyscan -p 48965 <АДРЕС_СЕРВЕРА>
```

⚠ Флаг `-p` обязателен. При нестандартном порте запись имеет вид
`[адрес]:48965 ssh-ed25519 AAAA...`, и запись, снятая без `-p`, с ней не
совпадёт — проверка отклонит соединение.

Скопировать **все** строки вывода (кроме комментариев с `#`) в секрет
`VPS_KNOWN_HOSTS`.

### 4. GitHub Secrets и Variables

`Settings → Secrets and variables → Actions`

**Secrets** (вкладка *Secrets*):

| Имя | Значение | Зачем |
|---|---|---|
| `VPS_HOST` | адрес сервера | куда подключаться |
| `VPS_USER` | `y4s` | под кем |
| `VPS_SSH_PORT` | `48965` | нестандартный порт; вместе с адресом это карта входа, поэтому секрет, а не переменная |
| `VPS_SSH_KEY` | содержимое `~/.ssh/polet_deploy_ed25519` целиком | вход на сервер |
| `VPS_KNOWN_HOSTS` | вывод `ssh-keyscan -p 48965 <хост>` | защита от подмены сервера |

`VPS_HOST` и `VPS_USER` уже заведены под этими именами — их менять не нужно.
`VPS_SSH_KEY` нужно **перезаписать** новым ключом (или оставить прежний, если
решите не менять). `VPS_SSH_PORT` и `VPS_KNOWN_HOSTS` — новые.

**Variables** (вкладка *Variables*):

| Имя | Значение | Зачем |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://npo-polet.ru` | ⚠ **вшивается в образ при сборке.** `serverURL` Payload, абсолютные ссылки на медиа, адреса в письмах, дымовая проверка |
| `NEXT_PUBLIC_YM_ID` | номер счётчика Яндекс.Метрики, либо не заводить | без него счётчик просто не рендерится |
| `VPS_PROJECT_DIR` | не заводить (по умолчанию `/home/y4s/polet-next`) | только если каталог переедет |

**Что можно удалить.** Секреты `PAYLOAD_SECRET` и `DATABASE_URI` новому
процессу не нужны и раньше передавались в `pnpm build` без необходимости —
боевая строка подключения оказывалась в окружении job'а, где выполняется в
том числе код зависимостей. Приложение читает их при **запуске** из
`.env.production` на сервере.

### 5. Registry

Отдельно настраивать нечего. GHCR получает образы по `GITHUB_TOKEN`
(`packages: write` в job'е сборки), сервер скачивает их тем же токеном с
правом `packages: read`, который живёт один прогон. Долговременных учётных
данных для реестра на сервере не появляется.

После первой успешной сборки пакеты будут видны в
`https://github.com/users/<owner>/packages`. Они приватные — так и должно быть.

### 6. Первый запуск

```
[GITHUB]
Actions → Deploy → Run workflow → ветка master
```

либо просто влить что-нибудь в `master`.

### 6a. ⚠ Страховка на первую выкладку

Автооткат работает начиная со **второй** выкладки: он запускает предыдущий
образ из GHCR, а сейчас в проде работает образ `polet-next:9449892e...`,
собранный на самом сервере и в реестр никогда не уезжавший. Если первая
выкладка не выйдет в healthy, откатываться скрипту будет не на что — он это
честно скажет и остановится, но контейнер `app` к тому моменту уже будет
пересоздан.

Данные при этом в безопасности: дамп базы и архив медиа снимаются ДО любых
изменений, а тома не удаляются ни в одной ветке скрипта. Под угрозой только
доступность сайта на время разбирательства.

Перед первой выкладкой запишите, что работает сейчас:

```
[VPS]
docker inspect polet-next-app-prod --format '{{.Config.Image}}'
# → polet-next:9449892e1f30cef6382356d8d3f03a20d17371e1
docker images polet-next --format '{{.Repository}}:{{.Tag}}'
```

Если первая выкладка не поднялась — вернуть прежнюю версию вручную:

```
[VPS]
cd /home/y4s/polet-next
IMAGE_APP=polet-next:9449892e1f30cef6382356d8d3f03a20d17371e1 \
IMAGE_TOOLS=polet-next:9449892e1f30cef6382356d8d3f03a20d17371e1 \
  docker compose --project-directory /home/y4s/polet-next \
  --env-file .env.production -p polet-next \
  -f current/docker-compose.prod.yml up -d --wait app
```

⚠ Этот образ — единственный экземпляр прежней версии, он существует только на
диске сервера. **Не запускайте `docker image prune -a`** до тех пор, пока
новая схема не отработает хотя бы дважды. Обычный `docker image prune -f`
(без `-a`), который делает `deploy.sh`, образы с тегами не трогает.

### 7. Проверка результата

```
[VPS]
/home/y4s/polet-next/current/deploy/deploy.sh --status
docker compose -p polet-next ps
tail -60 /home/y4s/polet-next/logs/latest.log
```

```
[LOCAL]
curl -sS -o /dev/null -w '%{http_code}\n' https://npo-polet.ru/
curl -sS https://npo-polet.ru/api/health
```

Проверить, что данные на месте:

```
[VPS]
docker exec polet-next-postgres-prod psql -U npo_user -d npo_polet -c '\dt' | head -20
docker exec polet-next-app-prod sh -c 'ls /app/media | head; ls /app/media | wc -l'
ls -la /var/backups/polet-next/pre-deploy/
```

⚠ Отдельно проверьте, что абсолютные ссылки на медиа теперь ведут на
`https://npo-polet.ru`, а не на `http://localhost:3000`. До перехода
`NEXT_PUBLIC_APP_URL` в образ не передавался вовсе и компилировался в значение
по умолчанию — это чинится только пересборкой, и первая же новая выкладка её
делает.

---

## Требования к nginx (не управляются деплоем)

nginx стоит на хосте, его конфигурация в выкладку не входит и никогда через
git/CI не попадала. Одно требование к ней **обязательно**, и его нарушение
выглядит как упавшее приложение:

```nginx
# в server{} для npo-polet.ru
proxy_buffer_size       32k;
proxy_buffers           8 32k;
proxy_busy_buffers_size 64k;
```

**Почему.** Умолчание `proxy_buffer_size` — одна страница памяти, 4 КБ. Next.js
дублирует preload-ссылки на шрифты и изображения в HTTP-заголовок `Link` (на
главной он один занимает ~3.7 КБ) и добавляет `Content-Security-Policy` с
nonce (~0.6 КБ). Замер на проде 4 сентября 2026: заголовок ответа **4879
байт** против лимита в **4096**.

**Как это выглядит.** Сайт отдаёт 502 на все страницы. При этом:

- контейнер `app` — `healthy`, рестартов нет;
- `curl http://127.0.0.1:3004/` с хоста возвращает 200 и полный HTML;
- в `/var/log/nginx/polet-next.error.log` — `upstream sent too big header
  while reading response header from upstream`.

⚠ Ошибка пишется в **отдельный** лог этого сайта, а не в
`/var/log/nginx/error.log`. Смотреть туда — значит не увидеть ничего.

**Проверить размер заголовка:**

```
[VPS]
curl -sD - -o /dev/null http://127.0.0.1:3004/ | wc -c
```

Если это число приближается к настроенному `proxy_buffer_size` — поднимите
значение. Откат приложения здесь не помогает и не нужен: дело не в коде.

---

## Эксплуатация

```
[VPS]
# что выкачено, на что можно откатиться, какие есть бэкапы
/home/y4s/polet-next/current/deploy/deploy.sh --status

# откат на предыдущую успешную версию (образ уже на диске, это секунды)
/home/y4s/polet-next/current/deploy/deploy.sh --rollback

# изменили .env.production — перечитать его, не меняя версию кода
/home/y4s/polet-next/current/deploy/deploy.sh --restart

# логи
tail -f /home/y4s/polet-next/logs/latest.log
docker compose -p polet-next logs -f app
```

### Восстановление данных

Пред-выкладочные копии: `/var/backups/polet-next/pre-deploy/`
(`db-<stamp>.dump`, `media-<stamp>.tar.gz`), ночные —
`/var/backups/polet-postgres/`.

```
[VPS]
# база (операция РАЗРУШАЮЩАЯ, спросит подтверждение)
/home/y4s/polet-next/current/scripts/backup/pg-restore.sh --list
/home/y4s/polet-next/current/scripts/backup/pg-restore.sh /var/backups/polet-next/pre-deploy/db-<stamp>.dump

# медиа: распаковать в том поверх существующего содержимого
docker run --rm -i -v polet-next_media_data:/media alpine:3 tar xzf - -C /media \
  < /var/backups/polet-next/pre-deploy/media-<stamp>.tar.gz
```

### Воркер отложенного удаления аккаунтов

`account-deletion-worker` описан в `docker-compose.prod.yml`, но **не
поднимается** обычной выкладкой: он вынесен в профиль `workers`. На сервере он
не работал никогда — в проекте `polet-next` были ровно три контейнера
(`postgres`, `redis`, `app`). Он безвозвратно удаляет пользовательские данные
по истечении 14 дней, поэтому включать его «заодно» с правкой процесса
выкладки нельзя: это решение о поведении продукта.

Прежде чем включать, посмотрите, что накопилось:

```
[VPS]
docker exec polet-next-postgres-prod psql -U npo_user -d npo_polet \
  -c 'select id, status, created_at from account_deletion_requests order by created_at;'
```

Включить (после того, как убедились, что эти заявки действительно нужно
исполнить):

```
[VPS]
cd /home/y4s/polet-next/current
IMAGE_TOOLS="ghcr.io/<owner>/<repo>-tools:$(cat ../.deploy-state/last_successful_sha)" \
  docker compose --project-directory /home/y4s/polet-next \
  --env-file /home/y4s/polet-next/.env.production -p polet-next \
  --profile workers up -d account-deletion-worker
```

Чтобы он поднимался при каждой выкладке — задайте `UP_PROFILES=workers` в
`deploy/deploy.sh`.

---

## Уборка после перехода (необязательно, но полезно)

Старый процесс оставил на сервере мусор, который больше не пополняется:

```
[VPS]
# 20 ГБ build-кэша от сборок в проде. Тома и образы не трогает.
docker builder prune -f

# приватный ключ GitHub Actions, лежащий на самой машине, куда он даёт доступ
rm -f ~/.ssh/github_actions_polet_next ~/.ssh/github_actions_polet_next.pub
```

⚠ Рабочую копию git в `/home/y4s/polet-next/` (файлы `src/`, `app/`,
`package.json`, старый `deploy.sh`) **пока не удаляйте**: на её путь ссылается
установленный systemd-юнит ночных бэкапов
(`ExecStart=/home/y4s/polet-next/scripts/backup/pg-backup.sh`). Если решите
убрать её — сначала переведите юнит на `current/`:

```
[VPS]
sudo sed -i 's#/home/y4s/polet-next/scripts/backup/pg-backup.sh#/home/y4s/polet-next/current/scripts/backup/pg-backup.sh#' \
  /etc/systemd/system/polet-backup.service
sudo systemctl daemon-reload
sudo systemctl start polet-backup.service && journalctl -u polet-backup -n 30 --no-pager
```

**Никогда не выполняйте** `docker system prune -a`, `docker volume prune` или
`docker compose down -v` в этом проекте: тома `polet-next_postgres_data`
(база) и `polet-next_media_data` (загруженные файлы) существуют в одном
экземпляре.
