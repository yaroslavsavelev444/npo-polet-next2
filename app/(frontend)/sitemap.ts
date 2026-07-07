// app/(frontend)/sitemap.ts
import type { MetadataRoute } from "next";
import { getCachedCategories } from "@/payload/services/categories.service";
import { getCachedConsents } from "@/payload/services/consents.service";
import { getCachedProducts } from "@/payload/services/products.service";
import type { Category } from "@/payload-types";
import { baseURL } from "@/resources/content";

// Инвалидируется вместе с revalidateTag('products'/'categories'/'consents'),
// раз в час — достаточно для каталога, не создаёт лишней нагрузки на БД.
export const revalidate = 3600;

const STATIC_ROUTES: Array<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
}> = [
  { path: "", changeFrequency: "daily", priority: 1 },
  { path: "/category", changeFrequency: "daily", priority: 0.9 },
  { path: "/contacts", changeFrequency: "monthly", priority: 0.5 },
  { path: "/consents", changeFrequency: "yearly", priority: 0.3 },
];

function resolveCategorySlug(category: unknown): string | null {
  return typeof category === "object" && category !== null
    ? (category as Category).slug
    : null;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categoriesResult, consentsResult, productsResult] = await Promise.all([
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
  ]);

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: `${baseURL}${route.path}`,
    lastModified: new Date(),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  const categoryEntries: MetadataRoute.Sitemap = categoriesResult.docs.map(
    (category) => ({
      url: `${baseURL}/category/${category.slug}`,
      lastModified: new Date(category.updatedAt),
      changeFrequency: "weekly",
      priority: 0.8,
    }),
  );

  const productEntries: MetadataRoute.Sitemap = productsResult.docs.flatMap(
    (product) => {
      const slug = resolveCategorySlug(product.category);
      if (!slug) return [];
      return [
        {
          url: `${baseURL}/category/${slug}/products/${product.id}`,
          lastModified: new Date(product.updatedAt),
          changeFrequency: "weekly" as const,
          priority: 0.7,
        },
      ];
    },
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
    ...consentEntries,
  ];
}
