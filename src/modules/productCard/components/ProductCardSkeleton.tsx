/**
 * modules/productCard/components/ProductCardSkeleton.tsx
 *
 * Плейсхолдер карточки на время загрузки (Suspense-фолбэк каталога).
 * Геометрия зеркалит ProductCard слот в слот — тот же квадратный кадр, та же
 * высота служебной строки, названия, цены и кнопки, — чтобы подстановка
 * настоящих данных не давала сдвига вёрстки. Контейнера у скелетона нет по
 * той же причине, по которой его нет у карточки.
 */

import styles from "./ProductCard.module.css";

function Bone({ className }: { className: string }) {
	return <div className={`${styles.bone} ${className}`} />;
}

export function ProductCardSkeleton() {
	return (
		<div className={styles.card}>
			<div className={`${styles.frame} ${styles.bone}`} />

			<div className={styles.body}>
				{/* Служебная строка */}
				<div className="flex h-4 items-center">
					<Bone className="h-2 w-20" />
				</div>
				{/* Название — две строки */}
				<div className="mt-[0.5rem] flex min-h-[2.7em] flex-col gap-1.5">
					<Bone className="h-2.5 w-full" />
					<Bone className="h-2.5 w-2/3" />
				</div>
				{/* Цена */}
				<div className="mt-[0.25rem] flex h-7 items-center">
					<Bone className="h-4 w-24" />
				</div>

				<div className={styles.ctaSlot}>
					<Bone className="h-10 w-full" />
				</div>
			</div>
		</div>
	);
}
