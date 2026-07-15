import type { Category } from "@/payload-types";
import { cn } from "@/utils/cn";
import CategoryCard from "./CategoryCard";

export type GridColumns = 2 | 3 | 4;

interface CategoryGridProps {
	categories: Category[];
	loading?: boolean;
	columns?: GridColumns;
	className?: string;
}

const GRID_COLUMNS: Record<GridColumns, string> = {
	2: "lg:grid-cols-2",
	3: "lg:grid-cols-3",
	4: "lg:grid-cols-4",
};

function CategoryCardSkeleton() {
	return (
		<article
			aria-hidden="true"
			className="flex flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] animate-pulse"
		>
			<div className="aspect-square w-full bg-[var(--surface-secondary)]" />
			{/* !p-4: коллизия с .p-4 из @once-ui-system/core, см. CategoryCard.tsx */}
			<div className="flex flex-col gap-2.5 !p-4">
				<div className="h-4 w-3/4 rounded bg-[var(--surface-secondary)]" />
				<div className="h-3 w-full rounded bg-[var(--surface-secondary)]" />
				<div className="h-3 w-2/3 rounded bg-[var(--surface-secondary)]" />
			</div>
		</article>
	);
}

export default function CategoryGrid({
	categories,
	loading = false,
	columns = 4,
	className,
}: CategoryGridProps) {
	const skeletonCount = columns * 2;

	return (
		<section
			className={cn(
				"grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3",
				GRID_COLUMNS[columns],
				className,
			)}
		>
			{loading
				? Array.from({ length: skeletonCount }).map((_, index) => (
						<CategoryCardSkeleton key={index} />
					))
				: categories.map((category, index) => (
						<CategoryCard
							key={category.id}
							category={category}
							priority={index < 8}
						/>
					))}
		</section>
	);
}
