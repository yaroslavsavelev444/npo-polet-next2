// app/(frontend)/categories/[categorySlug]/page.tsx
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getCachedCategoryBySlug } from '@/payload/services/categories.service';
import { getCatalogData } from '@/payload/services/products.service';
import { ProductCatalogLayout } from '@/modules/productCatalog/components/ProductCatalogLayout';
import { Breadcrumbs } from '@/components/Breadcrumbs/Breadcrumbs';
import { ProductListContainer } from '@/modules/productCard/components/ProductListContainer';
import type { ProductQuery } from '@/modules/productCard/types/query';
import { parseCatalogSearchParams } from '@/modules/productCatalog/lib/parseFilters';

interface Props {
  params: Promise<{ categorySlug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { categorySlug } = await params;
  const category = await getCachedCategoryBySlug(categorySlug);
  
  if (!category) return { title: 'Категория не найдена' };

  return {
    title: category.metaTitle || category.name,
    description: category.metaDescription || category.description,
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { categorySlug } = await params;
  const rawSearchParams = await searchParams;

  // Получаем категорию
  const category = await getCachedCategoryBySlug(categorySlug);
  if (!category) notFound();

  // Парсим и валидируем searchParams
  const filters = parseCatalogSearchParams(rawSearchParams);

  const query: ProductQuery = {
    categoryId: category.id,
    isVisible: true,
    priceFrom: filters.priceFrom,
    priceTo: filters.priceTo,
    status: filters.status === 'all' ? undefined : filters.status,
    sort: filters.sort,
    order: filters.order,
    limit: 24,
    page: filters.page,
  };

  // Один запрос — получаем всё необходимое
  const catalogResult = await getCatalogData(query);

  const breadcrumbItems = [
    { title: 'Главная', href: '/' },
    { title: category.name, href: `/categories/${categorySlug}` },
  ];

  return (
    <main className="min-h-screen pb-12">
      <div className="container mx-auto px-4 py-8">
        <Breadcrumbs items={breadcrumbItems} variant='white'/>

        <ProductCatalogLayout
          category={category}
          catalogResult={catalogResult}
        >
          <ProductListContainer
            products={catalogResult.products}
            totalProducts={catalogResult.totalDocs}
            title={`Товары в категории ${category.name}`}
            description={category.description || undefined}
            // Можно добавить pagination props позже
          />
        </ProductCatalogLayout>
      </div>
    </main>
  );
}