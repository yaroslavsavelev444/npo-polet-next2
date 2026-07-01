// src/modules/product/components/ProductsSection.tsx
import type { ProductCardData } from '@/modules/productCard/types';
import { ProductGrid } from './productGrid';

interface ProductsSectionProps {
  products: ProductCardData[];
  title?: string;
  description?: string;
  emptyMessage?: string;
  showQuickView?: boolean;
  onQuickView?: (product: ProductCardData) => void;
  className?: string;
}

export function ProductsSection({
  products = [], 
  title,
  description,
  emptyMessage = 'Товаров не найдено.',
  showQuickView,
  onQuickView,
  className,
}: ProductsSectionProps) {
  return (
    <section className={className}>
      {/* Заголовок и описание */}
      {(title || description) && (
        <div className="mb-6">
          {title && <h2 className="text-2xl font-bold">{title}</h2>}
          {description && <p className="text-muted-foreground">{description}</p>}
        </div>
      )}

      {/* Слот для будущего Toolbar (сортировка, переключение вида) */}
      <div className="mb-4 flex items-center justify-between">
        {/* Переключатель Grid/List (пока заглушка) */}
      </div>

      {/* Grid или список */}
      {products.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-lg border border-dashed">
          <p className="text-muted-foreground">{emptyMessage}</p>
        </div>
      ) : (
        <ProductGrid
          products={products}
          showQuickView={showQuickView}
          onQuickView={onQuickView}
        />
      )}

      {/* Слот для будущей пагинации */}
      <div className="mt-8">{/* Pagination */}</div>
    </section>
  );
}