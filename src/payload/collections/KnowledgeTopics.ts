import type { CollectionConfig, Where } from "payload";
import { isAdminOrSuperAdmin } from "../access/isAdminOrSuperAdmin.ts";
import { indexKnowledgeTopic } from "../hooks/knowledge/indexKnowledgeTopic.ts";
import { createRevalidateCacheHook } from "../hooks/revalidateCache.ts";
import { trackPreviousSlug } from "../hooks/trackPreviousSlug.ts";
import { knowledgeEditor } from "../lexical/knowledgeEditor.ts";
import { generateSlug } from "../utils/generateSlug.ts";

/**
 * Материал базы знаний — «тема/статья» в терминах ТЗ.
 *
 * Slug коллекции сознательно оставлен прежним (`knowledge-topics`), хотя набор
 * полей переработан почти полностью: переименование коллекции означало бы
 * переименование таблицы и всех связанных с ней объектов ради чисто
 * косметической разницы, при том что «topic» и есть «тема» из требований.
 * Все существующие статьи и их адреса сохраняются.
 *
 * Что изменилось по сравнению с прежней версией и почему:
 *  - `content` перешёл с `type: "blocks"` (heading/text/image/link) на lexical.
 *    Прежняя схема не давала ни списков, ни таблиц, ни ссылки внутри
 *    предложения — руководство по эксплуатации на ней не написать;
 *  - чекбокс `published` заменён штатными черновиками Payload (`_status`).
 *    Чекбокс не давал ни истории версий, ни возможности править
 *    опубликованную статью, не показывая правки читателям;
 *  - появились обязательный раздел, необязательная секция, рекомендованные
 *    статьи и денормализованный `searchText` для поиска по содержимоxvxcvxcvму.
 */
export const KnowledgeTopics: CollectionConfig = {
  slug: "knowledge-topics",
  labels: { singular: "Статья базы знаний", plural: "Статьи базы знаний" },

  admin: {
    useAsTitle: "title",
    defaultColumns: [
      "title",
      "category",
      "section",
      "position",
      "_status",
      "updatedAt",
    ],
    group: "База знаний",
    description:
      "Материалы базы знаний. Черновики не видны на сайте, не попадают в поиск и не индексируются.",
  },

  // Порядок в админке совпадает с порядком на сайте.
  defaultSort: "position",

  versions: {
    // Черновики: «Сохранить черновик» пишет только в историю версий, а
    // главная запись (та, которую читает сайт) обновляется исключительно
    // при публикации. Поэтому опубликованную статью можно спокойно
    // переписывать — читатели продолжают видеть последнюю опубликованную
    // версию, пока правки не опубликуют явно. Снятие с публикации
    // возвращает главной записи _status: "draft", и статья исчезает
    // отовсюду: из списка, из поиска, из рекомендаций, из sitemap.
    drafts: true,
    maxPerDoc: 20,
  },

  access: {
    // Публично читаются ТОЛЬКО опубликованные статьи. Ограничение возвращает
    // where-условие, а не false: так неопубликованная статья не «запрещена»,
    // а просто не существует для анонимного запроса — и REST-эндпоинт
    // /api/knowledge-topics не превращается в оракул «такой черновик есть».
    //
    // Local API по умолчанию идёт с overrideAccess: true, поэтому серверный
    // слой (services/knowledge.service.ts) ставит то же условие сам — это не
    // дублирование, а второй независимый рубеж.
    read: ({ req }) => {
      if (req.user?.collection === "admins") return true;
      return { _status: { equals: "published" } };
    },
    create: isAdminOrSuperAdmin,
    update: isAdminOrSuperAdmin,
    delete: isAdminOrSuperAdmin,
    readVersions: isAdminOrSuperAdmin,
  },

  hooks: {
    beforeChange: [trackPreviousSlug, indexKnowledgeTopic],
    afterChange: [createRevalidateCacheHook("knowledge")],
    afterDelete: [createRevalidateCacheHook("knowledge")],
  },

  fields: [
    {
      type: "tabs",
      tabs: [
        // ── Содержимое ───────────────────────────────────────────────────
        {
          label: "Статья",
          fields: [
            {
              name: "title",
              type: "text",
              required: true,
              index: true,
              label: "Заголовок",
            },
            {
              name: "description",
              type: "textarea",
              label: "Краткое описание",
              maxLength: 400,
              admin: {
                description:
                  "1–2 предложения. Показывается в списке материалов и подставляется в meta description, если SEO-описание не задано.",
              },
            },
            {
              name: "content",
              type: "richText",
              label: "Содержимое",
              editor: knowledgeEditor,
            },
          ],
        },

        // ── Размещение ───────────────────────────────────────────────────
        {
          label: "Размещение",
          fields: [
            {
              name: "category",
              type: "relationship",
              relationTo: "knowledge-categories",
              required: true,
              index: true,
              label: "Раздел",
              admin: {
                description:
                  "Определяет адрес статьи: /knowledge/<раздел>/<статья>.",
              },
            },
            {
              name: "section",
              type: "relationship",
              relationTo: "knowledge-sections",
              label: "Секция (необязательно)",
              index: true,
              // Показываем только секции выбранного раздела: иначе легко
              // сохранить статью в секции чужого раздела, и на странице
              // она пропадёт из списка (страховка на запись —
              // в indexKnowledgeTopic).
              filterOptions: ({ data }): Where =>
                data?.category
                  ? { category: { equals: data.category } }
                  : // Раздел ещё не выбран — предлагать нечего: любая секция
                    // принадлежит какому-то разделу, и без него выбор
                    // заведомо приведёт к рассогласованию.
                    { id: { exists: false } },
              admin: {
                description:
                  "Дополнительная группировка внутри раздела. Нужна только при большом количестве материалов.",
                condition: (data) => Boolean(data?.category),
              },
            },
            {
              name: "related",
              type: "relationship",
              relationTo: "knowledge-topics",
              hasMany: true,
              maxRows: 6,
              label: "Рекомендуем прочитать",
              // Саму себя статья рекомендовать не может. Здесь — чтобы
              // такой вариант просто не появлялся в выпадающем списке;
              // на запись то же правило применяет indexKnowledgeTopic.
              filterOptions: ({ id }) =>
                id ? { id: { not_equals: id } } : true,
              admin: {
                description:
                  "Порядок в списке = порядок на странице. Если ничего не выбрано, блок рекомендаций не отображается.",
              },
            },
            {
              name: "image",
              type: "upload",
              relationTo: "media",
              label: "Обложка",
              filterOptions: { mimeType: { contains: "image" } },
              admin: {
                description:
                  "Показывается в списке материалов и используется как картинка для соцсетей, если не задана отдельная.",
              },
            },
            {
              name: "tags",
              type: "array",
              label: "Теги",
              admin: {
                description:
                  "Участвуют в поиске. На отдельные страницы тегов не ведут.",
              },
              fields: [{ name: "tag", type: "text" }],
            },
          ],
        },

        // ── SEO ──────────────────────────────────────────────────────────
        {
          label: "SEO",
          fields: [
            {
              name: "seo",
              type: "group",
              label: false,
              fields: [
                {
                  name: "metaTitle",
                  type: "text",
                  label: "Meta Title",
                  admin: {
                    description: "Если пусто — берётся заголовок статьи.",
                  },
                },
                {
                  name: "metaDescription",
                  type: "textarea",
                  label: "Meta Description",
                  admin: {
                    description: "Если пусто — берётся краткое описание.",
                  },
                },
                {
                  name: "ogImage",
                  type: "upload",
                  relationTo: "media",
                  label: "Картинка для соцсетей",
                  filterOptions: { mimeType: { contains: "image" } },
                  admin: {
                    description: "Если пусто — берётся обложка статьи.",
                  },
                },
              ],
            },
          ],
        },
      ],
    },

    // ── Сайдбар ──────────────────────────────────────────────────────────
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      index: true,
      label: "Адрес (slug)",
      hooks: { beforeValidate: [generateSlug] },
      admin: {
        position: "sidebar",
        description:
          "Уникален на весь сайт, поэтому статью можно перенести в другой раздел, не меняя адрес: старый путь сам уйдёт 301-редиректом на новый.",
      },
    },
    {
      name: "previousSlugs",
      type: "array",
      label: "Прежние адреса",
      admin: {
        position: "sidebar",
        readOnly: true,
        description: "Ведут на текущий адрес 301-редиректом.",
        condition: (data) => Boolean(data?.previousSlugs?.length),
      },
      fields: [{ name: "slug", type: "text" }],
    },
    {
      name: "position",
      type: "number",
      defaultValue: 0,
      index: true,
      label: "Порядок",
      admin: {
        position: "sidebar",
        description: "Порядок внутри раздела/секции. Меньше — выше.",
      },
    },
    {
      name: "featured",
      type: "checkbox",
      defaultValue: false,
      index: true,
      label: "Вынести в «Рекомендуем»",
      admin: {
        position: "sidebar",
        description:
          "Такие статьи показываются отдельным блоком в начале базы знаний.",
      },
    },
    {
      name: "publishedAt",
      type: "date",
      label: "Дата публикации",
      admin: {
        position: "sidebar",
        description:
          "Показывается читателю и уходит в структурированные данные. Если пусто — берётся дата создания.",
        date: { pickerAppearance: "dayOnly", displayFormat: "dd.MM.yyyy" },
      },
    },
    {
      name: "author",
      type: "relationship",
      relationTo: "users",
      label: "Автор",
      admin: { position: "sidebar" },
    },
    {
      name: "readingTime",
      type: "number",
      label: "Время чтения, мин",
      admin: {
        position: "sidebar",
        readOnly: true,
        description: "Считается автоматически по объёму текста при сохранении.",
      },
    },
    {
      // Плоский текст статьи для поиска. Скрыт от редактора: это
      // производное значение, править его руками нечего и незачем
      // (см. indexKnowledgeTopic).
      name: "searchText",
      type: "textarea",
      index: true,
      admin: { hidden: true },
    },
  ],
};
