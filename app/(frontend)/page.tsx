import type { Metadata } from "next";
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
import { getCachedSettings } from "@/payload/services/settings.service";
import type { Category } from "@/payload-types";
import { baseURL } from "@/resources/content";
import { getHeroBackground } from "@/utils/settings-helpers";
import { HeroMediaBackground } from "@/widgets/Hero/HeroMediaBackground";

// Canonical задаётся здесь, а не в layout: layout общий для всех страниц, и
// указанный там canonical достался бы по наследству /contacts, /consents и
// прочим страницам без собственного canonical — все они схлопнулись бы в
// главную. Title/description при этом по-прежнему наследуются от layout.
export const metadata: Metadata = {
  alternates: { canonical: baseURL },
};

export default async function Home() {
  // Параллельная загрузка
  const [
    heroResult,
    defaultResult,
    popularProductsResult,
    categoriesResult,
    settings,
  ] = await Promise.all([
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
    getCachedSettings(),
  ]);

  const categories: Category[] = categoriesResult.docs || [];
  const heroBackground = getHeroBackground(settings);

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Фон Hero-секции, заданный в настройках админки (изображение или видео) */}
      {heroBackground.hasMedia && (
        <section
          className="relative isolate mb-8 flex min-h-[420px] items-center justify-center overflow-hidden md:min-h-[560px]"
          style={{
            width: "100vw",
            marginLeft: "calc(50% - 50vw)",
            marginRight: "calc(50% - 50vw)",
            marginTop:
              "calc(-1 * (var(--sticky-header-height) + var(--responsive-space-l)))",
            paddingTop:
              "calc(var(--sticky-header-height) + var(--responsive-space-l))",
          }}
        >
          <HeroMediaBackground
            imageUrl={heroBackground.imageUrl}
            videoUrl={heroBackground.videoUrl}
            posterUrl={heroBackground.posterUrl}
          />
        </section>
      )}

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
