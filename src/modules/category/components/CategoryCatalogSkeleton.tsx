import catalog from "@/modules/productCatalog/components/Catalog.module.css";
import styles from "./CategoryCatalog.module.css";

/**
 * Заглушка витрины на время, пока считаются разделы.
 *
 * Повторяет геометрию настоящей выдачи — липкую панель и сетку кадров, — и
 * берёт для панели тот же класс .rail. Это не педантизм: заглушка другого
 * роста означала бы, что в момент подстановки данных страница дёргается, а
 * первый экран над ней уже показан и стоит на месте.
 *
 * Пульсация — общая утилита витрины (animate-pulse), чтобы заглушка не
 * заводила собственного ритма.
 */
export function CategoryCatalogSkeleton({ count = 8 }: { count?: number }) {
	return (
		<div className="flex flex-col" aria-hidden="true">
			<div className={catalog.rail}>
				<div className={styles.controls}>
					<div className={styles.metaCell}>
						<div className={`${styles.skeletonLine} w-[7rem] animate-pulse`} />
					</div>
					<div className={styles.searchCell}>
						<div className="h-9 w-full animate-pulse rounded-full border border-[var(--border)]" />
					</div>
					<div className={styles.sortCell}>
						<div className="h-9 w-[9rem] animate-pulse rounded-full border border-[var(--border)]" />
					</div>
				</div>
			</div>

			<div className="mt-[2rem] sm:mt-[2.5rem]">
				<div className="@container">
					<ul className={styles.grid}>
						{Array.from({ length: count }, (_, index) => (
							<li key={index} className="animate-pulse">
								<div className={styles.skeletonFrame} />
								<div className="flex flex-col gap-2.5 !pt-4">
									<div className={`${styles.skeletonLine} w-4/5`} />
									<div className={`${styles.skeletonLine} w-3/5`} />
								</div>
							</li>
						))}
					</ul>
				</div>
			</div>
		</div>
	);
}

export default CategoryCatalogSkeleton;
