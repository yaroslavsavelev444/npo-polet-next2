# Руководства по эксплуатации → база знаний

Картинки шести статей, перенесённых из PPTX-инструкций производителя: «Паук 30»,
«Паук 30Б», сеткомёты для FPV и Mavic, «Вултур» Р10v2, тройная установка. Тексты — в
`src/modules/knowledge/seed/instructions.ts`, загрузчик —
`scripts/seed-knowledge-instructions.ts` (подробности — в его шапке).

Номера-выноски «1, 2, 3» впечены в фото: в презентациях они лежали поверх
картинок отдельными надписями. Фото индикации склеены в полосы — по отдельности
они 420 px и расплылись бы на ширине статьи.

## Запуск на сервере (один раз, после выкладки)

Выкладка этого коммита сама снимет дамп базы и архив медиа и применит
миграцию `20261023_120000_knowledge_search_text_index` — без неё длинные статьи
не сохраняются. Загрузчик запускается руками после неё:

```bash
cd /home/y4s/polet-next
SHA=$(cat .deploy-state/last_successful_sha)
export IMAGE_APP="$(cat .deploy-state/registry)/$(cat .deploy-state/repo)-app:$SHA"
export IMAGE_TOOLS="$(cat .deploy-state/registry)/$(cat .deploy-state/repo)-tools:$SHA"
seed() {
  docker compose --project-directory /home/y4s/polet-next --env-file .env.production \
    -p polet-next -f current/docker-compose.prod.yml --profile tools \
    run --rm --no-deps -v polet-next_media_data:/app/media migrate \
    node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types \
    --import ./tests/support/next-subpath-resolver.mjs \
    scripts/seed-knowledge-instructions.ts "$@"
}
seed --dry-run   # только отчёт: что будет создано, какие товары нашлись
seed             # запись
```

`-v polet-next_media_data:/app/media` обязателен: без него картинки запишутся
внутрь одноразового контейнера и исчезнут вместе с ним, а в базе останутся
ссылки на несуществующие файлы.

Статьи создаются **черновиками** — на сайте их нет, пока их не опубликуют в
админке (База знаний → Статьи → статья → «Опубликовать»). Повторный запуск
ничего не дублирует и не перезаписывает.

## Откат

Удалить в админке шесть статей `rukovodstvo-*`, картинки `instr-*` в «Медиа»
и, если не нужны, секции «Ручные сеткомёты» / «Сеткомёты для дронов» /
«Стационарные установки». Или
восстановить дамп и архив медиа, снятые выкладкой
(`/var/backups/polet-next/pre-deploy/`, см. deploy/README.md).
