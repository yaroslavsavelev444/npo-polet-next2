/**
 * modules/productCard/components/ProductCardSkeleton.tsx
 *
 * Плейсхолдер карточки на время загрузки (Suspense-фолбэк каталога).
 * Геометрия зеркалит ProductCard слот в слот — тот же квадратный кадр, та же
 * высота служебной строки, цены, названия и кнопки, — чтобы подстановка
 * настоящих данных не давала сдвига вёрстки.
 */

function Bone({ className }: { className: string }) {
	return (
		<div
			className={`animate-pulse rounded-[var(--radius-sm)] bg-[var(--surface-secondary)] ${className}`}
		/>
	);
}

export function ProductCardSkeleton() {
	return (
		<div className="flex h-full flex-col overflow-hidden rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--surface)]">
			<div className="aspect-square w-full animate-pulse border-b border-[var(--hairline)] bg-[var(--media-plate)]" />

			<div className="flex flex-1 flex-col p-3 sm:p-3.5">
				{/* Служебная строка — h-4 */}
				<div className="flex h-4 items-center">
					<Bone className="h-2.5 w-20" />
				</div>
				{/* Цена — h-7 */}
				<div className="mt-[0.5rem] flex h-7 items-center">
					<Bone className="h-4 w-24" />
				</div>
				{/* Название — две строки */}
				<div className="mt-0.5 flex min-h-[2.7em] flex-col justify-start gap-1.5 pt-[0.25rem]">
					<Bone className="h-2.5 w-full" />
					<Bone className="h-2.5 w-2/3" />
				</div>

				<div className="mt-auto pt-3">
					<Bone className="h-10 w-full" />
				</div>
			</div>
		</div>
	);
}
