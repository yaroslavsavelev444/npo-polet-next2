//TODO адаптировать под струткуру и сервисы текущего проекта

import type { MetadataRoute } from "next";
import { baseURL } from "@/resources/content";
import { getCachedCategories } from "@/services/payload/categories";
import { getCachedConsents } from "@/services/payload/consents";
import { getCachedProducts } from "@/services/payload/products";

// Пересчитываем раз в час — не на каждый запрос краулера.
export const revalidate = 3600;

const STATIC_ROUTES: Array<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
}> = [
  { path: "", changeFrequency: "weekly", priority: 1 },
  { path: "/about", changeFrequency: "monthly", priority: 0.7 },
  { path: "/catalog", changeFrequency: "daily", priority: 0.9 },
  { path: "/contacts", changeFrequency: "yearly", priority: 0.5 },
  { path: "/consents", changeFrequency: "yearly", priority: 0.3 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categories, consents, products] = await Promise.all([
    getCachedCategories(),
    getCachedConsents(),
    // NOTE: если каталог перерастёт несколько тысяч товаров — переходить на
    // generateSitemaps() (чанки по entity id) вместо одного файла, лимит
    // Google — 50 000 URL на sitemap.
    getCachedProducts({ limit: 5000, sort: "-updatedAt" })(),
  ]);

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: `${baseURL}${route.path}`,
    lastModified: new Date(),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  const categoryEntries: MetadataRoute.Sitemap = categories.map((category) => ({
    url: `${baseURL}/catalog/${category.slug}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const productEntries: MetadataRoute.Sitemap = products.docs.map((product) => {
    const categorySlug =
      typeof product.category === "object" ? product.category.slug : "";
    return {
      url: `${baseURL}/catalog/${categorySlug}/${product.slug}`,
      lastModified: new Date(product.updatedAt),
      changeFrequency: "weekly",
      priority: 0.6,
    };
  });

  const consentEntries: MetadataRoute.Sitemap = consents.map((consent) => ({
    url: `${baseURL}/consents/${consent.slug}`,
    lastModified: new Date(consent.updatedAt),
    changeFrequency: "yearly",
    priority: 0.3,
  }));

  return [
    ...staticEntries,
    ...categoryEntries,
    ...productEntries,
    ...consentEntries,
  ];
}
