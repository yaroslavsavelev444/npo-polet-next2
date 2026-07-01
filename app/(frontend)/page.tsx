// app/(frontend)/page.tsx
import { ContentBlockGroup } from "@/modules/contentBlocks/components/ContentBlockGroup";

// Правильный импорт из barrel-файла
import {
  getActiveContentBlocks,
  getContentBlocksByVariant,
} from "@/modules/contentBlocks/lib";
import { ProductListContainer } from "@/modules/productCard/components/ProductListContainer";

export default async function Home() {
  // Параллельная загрузка для лучшей производительности
  const [heroResult, defaultResult] = await Promise.all([
    getContentBlocksByVariant("hero", 6),
    getActiveContentBlocks({ limit: 12 }),
  ]);

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Hero блоки */}
      <ContentBlockGroup
        blocks={heroResult.docs}
        variant="featured"
        title="Главные блоки"
      />

      {/* Обычные блоки */}
      <ContentBlockGroup
        blocks={defaultResult.docs}       
      />

       <ProductListContainer
          query={{ showOnMainPage: true, isVisible: true }}
          title="Популярные товары"
        />
    </div>
  );
}