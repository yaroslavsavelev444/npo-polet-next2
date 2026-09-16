import styles from "@/modules/orders/components/Orders.module.css";
import { PageContainer } from "@/shared/components/PageContainer";

/**
 * Заглушка на время подготовки страницы заказа.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЗАЧЕМ ОНА ЗДЕСЬ
 * ────────────────────────────────────────────────────────────────────────────
 * Страница объявлена force-dynamic: каждый заход идёт в базу за свежим
 * состоянием заказа. Без этого файла переход из «Моих заказов» выглядит как
 * подвисшая ссылка — старая страница стоит на месте, пока сервер не отдаст
 * новую. Файл создаёт границу Suspense, и переход становится мгновенным:
 * каркас появляется сразу, содержимое доезжает следом.
 *
 * Заглушка повторяет ГЕОМЕТРИЮ страницы, а не рисует спиннер посреди пустоты:
 * знак состояния, заголовок, номер, сумма и два столбца содержимого стоят на
 * тех же местах, что и настоящие. Поэтому в момент подстановки данных
 * страница не дёргается — меняется только содержимое уже занятых мест.
 *
 * Заглушка декоративна: aria-hidden убирает её из дерева доступности целиком,
 * а состояние «идёт загрузка» скринридеру сообщает сам факт навигации.
 */
export default function OrderLoading() {
	return (
		<main
			className="full-bleed min-h-screen"
			style={{
				marginTop: "calc(-1 * var(--responsive-space-l))",
				marginBottom: "calc(-1 * var(--responsive-space-l))",
			}}
			aria-hidden
		>
			<section
				className={styles.pageHero}
				style={{
					marginTop: "calc(-1 * var(--sticky-header-height))",
					paddingTop: "var(--sticky-header-height)",
				}}
			>
				<span className={styles.pageHeroSeam} />

				<PageContainer className={styles.pageHeroInner}>
					<div className={styles.heroBody}>
						<div
							className={`${styles.pageSkeletonMark} ${styles.skeletonPulse}`}
						/>
						<div
							className={`${styles.pageSkeletonBlock} ${styles.skeletonPulse}`}
							style={{
								width: "min(22rem, 70%)",
								height: "2.5rem",
								marginTop: "1.5rem",
							}}
						/>
						<div
							className={`${styles.pageSkeletonBlock} ${styles.skeletonPulse}`}
							style={{ width: "14rem", height: "1.1rem", marginTop: "1rem" }}
						/>
						<div
							className={`${styles.pageSkeletonBlock} ${styles.skeletonPulse}`}
							style={{ width: "9rem", height: "2.25rem", marginTop: "1.75rem" }}
						/>
					</div>

					<div className={styles.heroFacts}>
						{[0, 1, 2].map((index) => (
							<div key={index} className={styles.heroFact}>
								<div
									className={`${styles.pageSkeletonBlock} ${styles.skeletonPulse}`}
									style={{ width: "5rem", height: "0.6rem" }}
								/>
								<div
									className={`${styles.pageSkeletonBlock} ${styles.skeletonPulse}`}
									style={{ width: "min(12rem, 80%)", height: "1rem" }}
								/>
							</div>
						))}
					</div>
				</PageContainer>
			</section>

			<PageContainer className={styles.pageBody}>
				<div className={styles.pageLayout}>
					<div className={styles.pageMain}>
						{[0, 1].map((index) => (
							<div key={index} className={styles.block}>
								<div className={styles.blockHead}>
									<div
										className={`${styles.pageSkeletonBlock} ${styles.skeletonPulse}`}
										style={{ width: "8rem", height: "0.7rem" }}
									/>
								</div>
								{[0, 1, 2].map((row) => (
									<div key={row} className={styles.skeletonRow}>
										<div
											className={`${styles.skeletonLine} ${styles.skeletonPulse}`}
											style={{ width: `${70 - row * 12}%` }}
										/>
										<div
											className={`${styles.skeletonLine} ${styles.skeletonPulse}`}
											style={{ width: "4rem" }}
										/>
									</div>
								))}
							</div>
						))}
					</div>

					<div className={styles.pageRail}>
						<div className={styles.pageRailInner}>
							{[0, 1, 2].map((row) => (
								<div
									key={row}
									className={`${styles.skeletonLine} ${styles.skeletonPulse}`}
									style={{ width: row === 2 ? "60%" : "100%" }}
								/>
							))}
						</div>
					</div>
				</div>
			</PageContainer>
		</main>
	);
}
