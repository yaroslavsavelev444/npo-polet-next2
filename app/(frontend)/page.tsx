import CategoryGrid from "@/modules/category/components/CategoryGrid";
import { ContentBlockGroup } from "@/modules/contentBlocks/components/ContentBlockGroup";
import {
  getActiveContentBlocks,
  getContentBlocksByVariant,
} from "@/modules/contentBlocks/lib";
import { ProductListContainer } from "@/modules/productCard/components/ProductListContainer";

// Новые импорты для категорий
import { getCachedCategories } from "@/payload/services/categories.service";
import { getCatalogData } from "@/payload/services/products.service";
import type { Category } from "@/payload-types";

export default async function Home() {
  // Параллельная загрузка
  const [heroResult, defaultResult, popularProductsResult, categoriesResult] =
    await Promise.all([
      getContentBlocksByVariant("hero", 6),
      getActiveContentBlocks({ limit: 12 }),
      getCatalogData({
        showOnMainPage: true,
        isVisible: true,
        limit: 12,
      }),
      getCachedCategories({
        isActive: true,
        sort: "order",
        limit: 200,
        depth: 1,
      }),
    ]);

  const categories: Category[] = categoriesResult.docs || [];

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Hero блоки */}
      <ContentBlockGroup
        blocks={heroResult.docs}
        variant="featured"
        title="Главные блоки"
      />

      {/* Обычные блоки */}
      <ContentBlockGroup blocks={defaultResult.docs} />

      {/* === НОВЫЙ БЛОК: СЕТКА КАТЕГОРИЙ === */}
      {categories.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-6 text-3xl font-bold tracking-tight">
            Категории товаров
          </h2>
          <CategoryGrid categories={categories} columns={4} />
        </section>
      )}

      {/* Популярные товары */}
      <ProductListContainer
        products={popularProductsResult.products}
        totalProducts={popularProductsResult.totalDocs}
        title="Популярные товары"
      />
    </div>
  );
}
