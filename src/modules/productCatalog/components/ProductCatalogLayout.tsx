'use client';

import { Suspense, useState } from 'react';
import { Button, Badge } from 'antd';
import { FilterOutlined, SortAscendingOutlined } from '@ant-design/icons';
import { FiltersSidebar } from './FiltersSidebar';
import { InfoPanel } from './InfoPanel';
import { MobileFiltersDrawer } from './MobileFiltersDrawer';
import { MobileSortDrawer } from './MobileSortDrawer';
import type { ProductCatalogResult } from '../types/filters';

interface ProductCatalogLayoutProps {
  category: any;
  catalogResult: ProductCatalogResult;
  children: React.ReactNode; // ProductListContainer или ProductsSection
}

export function ProductCatalogLayout({
  category,
  catalogResult,
  children,
}: ProductCatalogLayoutProps) {
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [mobileSortOpen, setMobileSortOpen] = useState(false);

  const activeFiltersCount = 
    (catalogResult.pagination.totalPages > 0 ? 0 : 0) + // логика подсчёта по необходимости
    0; // можно улучшить позже

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">{category.name}</h1>
        {category.description && (
          <p className="text-muted-foreground text-lg">{category.description}</p>
        )}
      </div>

      <InfoPanel
        totalProducts={catalogResult.totalDocs}
        activeFiltersCount={activeFiltersCount}
      />

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Desktop Filters */}
        <div className="hidden lg:block w-80 shrink-0">
          <div className="sticky top-24">
            <FiltersSidebar />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Mobile controls */}
          <div className="lg:hidden flex gap-3 mb-6">
            <Button
              icon={<FilterOutlined />}
              onClick={() => setMobileFiltersOpen(true)}
              className="flex-1"
              size="large"
            >
              Фильтры {activeFiltersCount > 0 && <Badge count={activeFiltersCount} className="ml-1" />}
            </Button>

            <Button
              icon={<SortAscendingOutlined />}
              onClick={() => setMobileSortOpen(true)}
              className="flex-1"
              size="large"
            >
              Сортировка
            </Button>
          </div>

          <Suspense fallback={<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">{' '.repeat(6).split('').map((_, i) => <div key={i} className="h-80 bg-muted animate-pulse rounded-2xl" />)}</div>}>
            {children}
          </Suspense>
        </div>
      </div>

      <MobileFiltersDrawer open={mobileFiltersOpen} onClose={() => setMobileFiltersOpen(false)} />
      <MobileSortDrawer open={mobileSortOpen} onClose={() => setMobileSortOpen(false)} />
    </div>
  );
}