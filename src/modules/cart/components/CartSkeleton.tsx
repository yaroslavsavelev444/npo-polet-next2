import styles from "./Cart.module.css";

/**
 * Заглушка списка на время загрузки.
 *
 * Повторяет геометрию строки товара один в один, поэтому появление настоящих
 * данных не сдвигает ни пикселя. Три строки, а не одна: одна читается как
 * «грузится что-то одно», а корзина почти никогда не состоит из одной позиции.
 *
 * Полностью скрыта от скринридеров: озвучивать пустые прямоугольники нечем, а
 * о самой загрузке сообщает aria-busy на списке.
 */
export function CartSkeleton({ rows = 3 }: { rows?: number }) {
	return (
		<div aria-hidden="true">
			{Array.from({ length: rows }, (_, index) => (
				<div key={index} className={styles.skeletonRow}>
					<div className={styles.skeletonBlock} style={{ aspectRatio: "1" }} />
					<div
						style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}
					>
						<div
							className={styles.skeletonBlock}
							style={{ height: "0.7rem", width: "80%" }}
						/>
						<div
							className={styles.skeletonBlock}
							style={{ height: "0.6rem", width: "45%" }}
						/>
						<div
							className={styles.skeletonBlock}
							style={{ height: "2rem", width: "100%", marginTop: "auto" }}
						/>
					</div>
				</div>
			))}
		</div>
	);
}
