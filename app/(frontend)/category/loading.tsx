export default function CategoriesLoading() {
	return (
		<main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
			<div className="flex flex-col gap-6">
				<div className="h-11 w-64 animate-pulse rounded-2xl bg-[var(--surface)]" />
				<div className="flex flex-col gap-2">
					<div className="h-9 w-72 animate-pulse rounded bg-[var(--surface)]" />
					<div className="h-5 w-96 max-w-full animate-pulse rounded bg-[var(--surface)]" />
				</div>
			</div>

			<div className="flex flex-col gap-3">
				<div className="flex flex-col gap-3 sm:flex-row">
					<div className="h-10 animate-pulse rounded-md border border-[var(--border)] bg-[var(--surface)] sm:flex-1" />
					<div className="h-10 w-full animate-pulse rounded-md border border-[var(--border)] bg-[var(--surface)] sm:w-44" />
				</div>
				<div className="h-5 w-32 animate-pulse rounded bg-[var(--surface)]" />
			</div>

			<section className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
				{Array.from({ length: 8 }).map((_, index) => (
					<article
						key={index}
						className="flex flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]"
					>
						<div className="aspect-square w-full animate-pulse bg-[var(--surface-secondary)]" />
						{/* !p-4: коллизия с .p-4 из @once-ui-system/core, см. CategoryCard.tsx */}
						<div className="flex flex-col gap-2.5 !p-4">
							<div className="h-4 w-3/4 animate-pulse rounded bg-[var(--surface-secondary)]" />
							<div className="h-3 w-full animate-pulse rounded bg-[var(--surface-secondary)]" />
							<div className="h-3 w-2/3 animate-pulse rounded bg-[var(--surface-secondary)]" />
						</div>
					</article>
				))}
			</section>
		</main>
	);
}
