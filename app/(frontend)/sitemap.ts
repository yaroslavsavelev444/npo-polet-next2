// app/(frontend)/sitemap.ts
export const dynamic = "force-dynamic";
export const revalidate = 3600;

import type { MetadataRoute } from "next";
import { getCachedCategories } from "@/payload/services/categories.service";
import { getCachedConsents } from "@/payload/services/consents.service";
import { getKnowledgeSitemapEntries } from "@/payload/services/knowledge.service";
import {
  getCachedCategoryProductCounts,
  getCachedProducts,
} from "@/payload/services/products.service";
import type { Category } from "@/payload-types";
import { baseURL } from "@/resources/content";

// lastmod у статических страниц: "catalog" — дата последней правки товара или
// раздела (из них собраны главная и витрина каталога), "knowledge" — последней
// правки материала. У остальных честной даты нет, и lastmod у них не
// указывается вовсе: раньше всем стояло new Date() на каждый запрос, а Google
// учитывает lastmod, только если он "consistently and verifiably accurate", —
// вечное «изменено только что» учит его не доверять полю во всём файле.
type LastModSource = "catalog" | "knowledge";

const STATIC_ROUTES: Array<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
  lastModFrom?: LastModSource;
}> = [
  { path: "", changeFrequency: "daily", priority: 1, lastModFrom: "catalog" },
  {
    path: "/category",
    changeFrequency: "daily",
    priority: 0.9,
    lastModFrom: "catalog",
  },
  {
    path: "/knowledge",
    changeFrequency: "weekly",
    priority: 0.8,
    lastModFrom: "knowledge",
  },
  // FAQ меняется реже каталога, но это посадочная страница под
  // информационные запросы — приоритет выше служебных страниц.
  { path: "/faq", changeFrequency: "monthly", priority: 0.7 },
  // Публичная лента отзывов: содержимое обновляется по мере модерации.
  { path: "/reviews", changeFrequency: "weekly", priority: 0.6 },
  { path: "/contacts", changeFrequency: "monthly", priority: 0.5 },
  { path: "/consents", changeFrequency: "yearly", priority: 0.3 },
];

function latestDate(dates: Array<string | null | undefined>): Date | undefined {
  const times = dates
    .map((value) => (value ? new Date(value).getTime() : Number.NaN))
    .filter((time) => Number.isFinite(time));
  return times.length > 0 ? new Date(Math.max(...times)) : undefined;
}

function resolveCategorySlug(category: unknown): string | null {
  return typeof category === "object" && category !== null
    ? (category as Category).slug
    : null;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [
    categoriesResult,
    consentsResult,
    productsResult,
    knowledgeEntries,
    productCounts,
  ] = await Promise.all([
    getCachedCategories({ isActive: true, limit: 200 }),
    getCachedConsents({ isActive: true, limit: 100 }),
    // NOTE: при росте каталога выше ~40-45k товаров (лимит одного sitemap —
    // 50 000 URL) переходить на generateSitemaps() с чанкованием по id.
      getCachedProducts({
        isVisible: true,
        limit: 5000,
        sort: "-updatedAt",
        depth: 1,
      }),
      // Черновики сюда не попадают: сервис фильтрует по _status: published
      // (см. knowledge.service.ts). Снятая с публикации статья исчезает из
      // sitemap при следующей его генерации — то есть перестаёт предлагаться
      // поисковику ровно тогда же, когда пропадает с сайта.
      getKnowledgeSitemapEntries(),
      getCachedCategoryProductCounts(),
    ]);

  // Раздел без единого видимого товара — пустая страница «товаров нет». Google
  // помечает такие как soft 404, Яндекс — как малоценные; предлагать их
  // поисковику незачем (страница при этом сама отдаёт noindex, см.
  // category/[categorySlug]/page.tsx). Раздел вернётся в sitemap сам, как
  // только в нём появится товар.
  const populatedCategories = categoriesResult.docs.filter(
    (category) => (productCounts[String(category.id)] ?? 0) > 0,
  );

  const lastModBySource: Record<LastModSource, Date | undefined> = {
    catalog: latestDate([
      ...populatedCategories.map((category) => category.updatedAt),
      ...productsResult.docs.map((product) => product.updatedAt),
    ]),
    knowledge: latestDate(knowledgeEntries.map((entry) => entry.updatedAt)),
  };

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: `${baseURL}${route.path}`,
    lastModified: route.lastModFrom
      ? lastModBySource[route.lastModFrom]
      : undefined,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  const categoryEntries: MetadataRoute.Sitemap = populatedCategories.map(
    (category) => ({
      url: `${baseURL}/category/${category.slug}`,
      lastModified: new Date(category.updatedAt),
      changeFrequency: "weekly",
      priority: 0.8,
    }),
  );

  const productEntries: MetadataRoute.Sitemap = productsResult.docs.flatMap(
    (product) => {
      const categorySlug = resolveCategorySlug(product.category);
      if (!categorySlug) return [];

      // В sitemap попадают только канонические ЧПУ. Товар без slug доступен
      // лишь по legacy-id, а тот сам отдаёт 301 на ЧПУ — редиректы в sitemap
      // и Яндекс, и Google считают ошибкой. Товар вернётся сюда сам, как
      // только пройдёт бэкофилл (scripts/backfill-product-slugs.ts).
      if (!product.slug) return [];

      return [
        {
          url: `${baseURL}/category/${categorySlug}/products/${product.slug}`,
          lastModified: new Date(product.updatedAt),
          changeFrequency: "weekly" as const,
          priority: 0.7,
        },
      ];
    },
  );

  const knowledgeSitemap: MetadataRoute.Sitemap = knowledgeEntries.map(
    (entry) => ({
      url: `${baseURL}${entry.path}`,
      lastModified: new Date(entry.updatedAt),
      changeFrequency: "monthly",
      // Раздел базы знаний (два сегмента) чуть выше отдельной статьи (три):
      // он агрегирует материалы и меняется реже.
      priority: entry.path.split("/").length === 3 ? 0.7 : 0.6,
    }),
  );

  const consentEntries: MetadataRoute.Sitemap = consentsResult.docs.map(
    (consent) => ({
      url: `${baseURL}/consents/${consent.slug}`,
      lastModified: new Date(consent.updatedAt),
      changeFrequency: "yearly",
      priority: 0.3,
    }),
  );

  return [
    ...staticEntries,
    ...categoryEntries,
    ...productEntries,
    ...knowledgeSitemap,
    ...consentEntries,
  ];
}
