/**
 * modules/productCard/components/ProductCardSkeleton.tsx
 *
 * Плейсхолдер карточки на время загрузки (Suspense fallback в листинге
 * каталога). Геометрия зеркалит ProductCard 1:1 (те же отступы, aspect-square
 * изображения, высота CTA-ряда), чтобы подстановка настоящих данных не
 * вызывала layout shift.
 */

function Bone({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-[var(--radius-sm)] bg-[var(--surface-secondary)] ${className}`} />;
}

export function ProductCardSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]">
      <div className="aspect-square w-full animate-pulse bg-[var(--surface-secondary)]" />

      <div className="flex flex-1 flex-col gap-1.5 p-3 sm:p-4">
        <Bone className="h-3.5 w-20" />
        <Bone className="h-5 w-24" />
        <Bone className="h-[2.6em] w-full" />
        <div className="mt-auto pt-2">
          <Bone className="h-10 w-full" />
        </div>
      </div>
    </div>
  );
}
