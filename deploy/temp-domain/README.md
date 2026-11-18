# Временный домен на время недоступности npo-polet.ru

Сценарий на случай, когда сайт и сервер живы, но основной домен не резолвится
(02.11.2026 — сбой DNS регистратора Beget: NS-серверы `ns*.beget.*` не отвечали,
сменить NS или получить authinfo через упавшую панель было нельзя).

Идея — вторая «дверь» в тот же сайт, **без пересборки**. Образ по-прежнему
собран под `npo-polet.ru`: canonical, sitemap, микроразметка, товарный фид,
ссылки в письмах, адрес возврата Яндекс ID остаются на основном домене. Временный
домен закрыт от индексации и после восстановления превращается в постоянный
редирект. Пересборка под новый домен хуже: поисковики увидят два переезда,
письма за эти дни навсегда останутся со ссылками на временный адрес, Директ и
фид придётся перенастраивать дважды.

Ниже `npo-polet.online` — пример. Другое имя — заменить во всех трёх `.conf`:

```bash
sed -i 's/npo-polet\.online/НОВЫЙ-ДОМЕН/g' 1-bootstrap.conf 2-site.conf 3-redirect.conf
```

## Файлы

| Файл | Когда включён |
|---|---|
| `1-bootstrap.conf` | только на время выпуска сертификата |
| `2-site.conf` | пока основной домен недоступен |
| `3-redirect.conf` | после восстановления — минимум год |
| `extra_hosts` в `docker-compose.prod.yml` | всегда (полезно и в обычное время) |

Все три `.conf` по очереди кладутся в **один и тот же** файл
`/etc/nginx/sites-available/npo-polet.online.conf`. Они ссылаются на upstream'ы и
зоны из `npo-polet.ru.conf` (nginx.txt) — тот должен оставаться включённым.

## Что закрыто и почему

- **Индексация.** Свой `robots.txt` (`Disallow: /`), `X-Robots-Tag: noindex` на
  всех ответах, `/sitemap.xml` и `/feed/` — 404. Приложение и так ставит
  canonical на `npo-polet.ru`.
- **Картинки.** Оптимизатор `/_next/image` скачивает медиа с `npo-polet.ru` —
  сервер ходит сам к себе по публичному имени. `extra_hosts` направляет это имя
  на IP сервера мимо DNS. `host-gateway` не годится: Next 16 отклоняет хосты,
  резолвящиеся в частный адрес.
- **Вход, корзина, формы, чат.** Payload и шлюз чата сверяют `Origin` с
  `ALLOWED_ORIGINS` — временный origin добавляется туда.
- **Админка** на временный домен не переносится: на чужом хосте `/admin` отдаёт
  404 (`proxy.ts`). Сотрудники открывают `admin.npo-polet.ru` через `hosts`.
- **Яндекс ID** выключается: адрес возврата собран из `NEXT_PUBLIC_APP_URL`, вход
  вернул бы покупателя на мёртвый домен.

## Алгоритм

### 0. Сразу, независимо от решения о домене

1. **Директ** — кампании на паузу (или включить «Мониторинг сайта»). Ссылки в
   объявлениях на временный домен **не менять**.
2. **Сотрудникам** — строка в `hosts` (Mac/Linux `/etc/hosts`, Windows
   `C:\Windows\System32\drivers\etc\hosts`), админка и сайт откроются как обычно:
   ```
   194.87.118.176 npo-polet.ru www.npo-polet.ru admin.npo-polet.ru
   ```
3. **Пост в Telegram** — телефон и Telegram менеджера для заказов.

### 1. Домен

1. Зарегистрировать временный домен у **другого** регистратора (reg.ru) с его же
   DNS — не Beget.
2. В DNS reg.ru: `A @ → 194.87.118.176`, `A www → 194.87.118.176`.
3. Дождаться: `dig +short npo-polet.online @8.8.8.8` возвращает IP (обычно до
   часа).

### 2. Приложение (на сервере)

1. Залить изменения этого коммита на сервер. Пока коммит не выкачен через CI —
   поправить `extra_hosts` руками в `/home/y4s/polet-next/current/docker-compose.prod.yml`
   (тот же блок, что в репозитории, у сервиса `app`). Следующая выкладка
   привезёт то же самое из git.
2. В `/home/y4s/polet-next/.env.production` дописать временный origin в конец
   `ALLOWED_ORIGINS` (через запятую, без пробелов и слэша на конце):
   ```
   ALLOWED_ORIGINS=https://npo-polet.ru,https://admin.npo-polet.ru,https://npo-polet.online
   ```
3. Перезапуск без смены версии:
   ```bash
   /home/y4s/polet-next/current/deploy/deploy.sh --restart
   ```
   В конце должно быть «контейнер пересоздан».
4. Проверка, что приложение достаёт картинки само у себя:
   ```bash
   docker exec polet-next-app-prod getent hosts npo-polet.ru
   docker logs polet-next-app-prod --since 5m 2>&1 | grep -cE "EAI_AGAIN|timed out"
   ```
   Первая команда — `194.87.118.176`; вторая после открытия пары страниц — `0`.
5. **Яндекс ID** (если включён): админка → Настройки → «Вход через Яндекс ID» →
   снять «Разрешить вход и регистрацию».

### 3. nginx и сертификат

```bash
sudo cp 1-bootstrap.conf /etc/nginx/sites-available/npo-polet.online.conf
sudo ln -s /etc/nginx/sites-available/npo-polet.online.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

sudo certbot certonly --webroot -w /var/www/certbot \
  -d npo-polet.online -d www.npo-polet.online

sudo cp 2-site.conf /etc/nginx/sites-available/npo-polet.online.conf
sudo nginx -t && sudo systemctl reload nginx
```

`nginx -t` — до каждого reload. Именно reload, не restart.

### 4. Проверка

```bash
curl -sI https://npo-polet.online/ | grep -iE "^HTTP|x-robots"   # 200 и noindex
curl -s  https://npo-polet.online/robots.txt                      # Disallow: /
curl -sI https://npo-polet.online/sitemap.xml | head -1           # 404
curl -s  https://npo-polet.online/realtime/health                 # ответ шлюза
```

В браузере на временном домене: картинки на главной и в каталоге, вход по коду
из письма, корзина, оформление тестового заказа, кнопка чата. Метрика: если в
счётчике включено «Принимать данные только с указанных адресов» — добавить
временный домен.

Пост в Telegram: временный адрес, «на нём нужно войти заново, заказы и кабинет
на месте».

### 5. Когда npo-polet.ru снова открывается

1. Проверить с нескольких сетей: `dig +short npo-polet.ru @8.8.8.8`,
   `@77.88.8.8`, открыть сайт с мобильного интернета.
2. Временный домен — в постоянный редирект:
   ```bash
   sudo cp 3-redirect.conf /etc/nginx/sites-available/npo-polet.online.conf
   sudo nginx -t && sudo systemctl reload nginx
   ```
3. Яндекс ID — включить обратно, если выключали.
4. Директ — снять с паузы.
5. Пост в Telegram: сайт снова на основном адресе.
6. Через 2–3 недели убрать временный origin из `ALLOWED_ORIGINS`,
   `deploy.sh --restart`.
7. Временный домен **продлевать минимум год** и не удалять сертификат: по старым
   ссылкам ещё долго будут приходить люди.
8. Сотрудникам — убрать строку из `hosts`.

## Чего не делать

- Не менять `NEXT_PUBLIC_APP_URL` и не пересобирать образ под временный домен.
- Не добавлять временный домен в Яндекс Вебмастер, Search Console, фид Директа.
- Не ставить HSTS на временный домен.
- Не включать `images.dangerouslyAllowLocalIP` в проде ради картинок — это снимает
  защиту от SSRF; `extra_hosts` решает задачу без неё.
