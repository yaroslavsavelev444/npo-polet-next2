import type { FieldHook } from 'payload'
import { slugify } from 'transliteration'

/**
 * Автогенерация slug из названия. Используется как beforeValidate-хук поля
 * `slug` в Categories и Products — руками его заполнять не нужно.
 *
 * Два правила, важные для SEO:
 *
 * 1. Заданный slug НИКОГДА не перезаписывается. В том числе при
 *    переименовании товара: его URL уже проиндексирован, и смена slug означает
 *    потерю позиций и битые внешние ссылки. Менять адрес — только осознанно,
 *    вручную, и тогда со старого должен уходить 301.
 *
 * 2. Slug гарантированно уникален. Поле объявлено `unique: true`, а названия
 *    товаров повторяются сплошь и рядом (одна модель в разных комплектациях).
 *    Без проверки занятости Payload просто отказывался создать второй такой
 *    товар с ошибкой "Следующее поле недействительно: slug" — заполнить slug
 *    руками было нельзя (поле readOnly), и товар не заводился вообще.
 *    Коллизия разрешается числовым суффиксом: `setkomet`, `setkomet-2`, ...
 */
const FALLBACK_BASE = 'item'

/**
 * Транслитерация названия в основу slug, без учёта занятости.
 *
 * Экспортируется только ради предпросмотра в сухом прогоне
 * scripts/backfill-product-slugs.ts — сам бэкофилл slug не собирает, а зовёт
 * этот же хук, чтобы правила генерации жили в одном месте.
 *
 * Названия из одних лишь спецсимволов дают пустую строку — такой slug сломал
 * бы маршрут, поэтому есть запасная основа.
 */
export function buildSlugBase(source: string): string {
  return (
    slugify(source, {
      lowercase: true,
      separator: '-',
      // strict: true,      // удаляет спецсимволы
    }) || FALLBACK_BASE
  )
}

export const generateSlug: FieldHook = async ({
  value,
  data,
  originalDoc,
  req,
  collection,
}) => {
  // Если slug уже задан (вручную или сгенерирован раньше) — не трогаем
  if (typeof value === 'string' && value.trim()) return value

  // Берём название из текущих данных (data) или из уже сохранённого документа.
  // `title` — у товаров, `name` — у категорий.
  const source = data?.name || data?.title || originalDoc?.name || originalDoc?.title

  // У локализованных полей при записи сразу во все локали (locale: 'all') сюда
  // приходит объект вида { ru, en }, а не строка. Слепой String() дал бы slug
  // "object-object", поэтому такой ввод пропускаем.
  if (!source || typeof source !== 'string') return value

  const base = buildSlugBase(source)

  // На всякий случай: у полей глобалов collection === null, а без коллекции
  // проверить занятость негде.
  if (!collection) return base

  // Один запрос вместо цикла точечных проверок: `like` в постгресе — это
  // ILIKE %base%, то есть выдача заведомо шире нужного (сюда попадут и
  // "setkomet-ruchnoy"). Это не мешает — ниже нас интересует лишь точное
  // совпадение с base и base-N.
  const { docs } = await req.payload.find({
    collection: collection.slug,
    where: { slug: { like: base } },
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })

  const taken = new Set(
    docs
      .filter((doc) => doc.id !== originalDoc?.id)
      .map((doc) => (doc as { slug?: string | null }).slug)
      .filter(Boolean),
  )

  if (!taken.has(base)) return base

  let suffix = 2
  while (taken.has(`${base}-${suffix}`)) suffix += 1

  return `${base}-${suffix}`
}
