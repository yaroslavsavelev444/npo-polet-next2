import type { Category } from '@/payload-types';
import CategoryCard from './CategoryCard';

export type GridColumns = 2 | 3 | 4;

interface CategoryGridProps {
  categories: Category[];
  loading?: boolean;
  columns?: GridColumns;
  className?: string;
}

const GRID_COLUMNS: Record<GridColumns, string> = {
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
};

function CategoryCardSkeleton() {
  return (
    <article
      aria-hidden="true"
      className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] animate-pulse"
    >
      <div className="aspect-[4/3] bg-[var(--neutral-alpha-medium)]" />

      <div className="space-y-3 p-4">

        <div className="h-5 w-3/4 rounded bg-[var(--neutral-alpha-medium)]" />

        <div className="h-4 w-full rounded bg-[var(--neutral-alpha-medium)]" />

        <div className="h-4 w-2/3 rounded bg-[var(--neutral-alpha-medium)]" />

        <div className="flex gap-2 pt-2">

          <div className="h-6 w-16 rounded-full bg-[var(--neutral-alpha-medium)]" />

          <div className="h-6 w-12 rounded-full bg-[var(--neutral-alpha-medium)]" />

          <div className="h-6 w-20 rounded-full bg-[var(--neutral-alpha-medium)]" />

        </div>

      </div>
    </article>
  );
}

export default function CategoryGrid({
  categories,
  loading = false,
  columns = 4,
  className = '',
}: CategoryGridProps) {

  const skeletonCount = columns * 2;

  return (
    <section
      className={[
        'grid',
        'grid-cols-2',
        'gap-4',
        'md:grid-cols-3',
        GRID_COLUMNS[columns],
        className,
      ].join(' ')}
    >

      {loading
        ? Array.from({
            length: skeletonCount,
          }).map((_, index) => (
            <CategoryCardSkeleton
              key={index}
            />
          ))
        : categories.map(
            (
              category,
              index,
            ) => (
              <CategoryCard
                key={category.id}
                category={category}
                priority={
                  index < 8
                }
              />
            ),
          )}

    </section>
  );
}