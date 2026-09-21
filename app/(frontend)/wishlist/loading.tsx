import { ProductGridSkeleton } from "@/modules/productCard/components/productGrid";
import styles from "@/modules/wishlist/components/Wishlist.module.css";
import { PageContainer } from "@/shared/components/PageContainer";

/**
 * Заглушка на время подготовки избранного.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЗАЧЕМ ОНА ЗДЕСЬ
 * ────────────────────────────────────────────────────────────────────────────
 * Страница объявлена force-dynamic: каждый заход идёт в базу за актуальным
 * списком. Без этого файла переход из шапки выглядит как подвисшая ссылка —
 * предыдущая страница стоит на месте, пока сервер не отдаст новую. Файл
 * создаёт границу Suspense, и переход становится мгновенным: каркас
 * появляется сразу, содержимое доезжает следом.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ БЕЗ СДВИГА ВЁРСТКИ
 * ────────────────────────────────────────────────────────────────────────────
 * Заглушка повторяет ГЕОМЕТРИЮ страницы, а не рисует спиннер посреди пустоты:
 * те же поля первого экрана, та же высота двухстрочного заголовка, та же
 * липкая панель и та же сетка. Сетка карточек — не самодельная: это
 * ProductGridSkeleton из того же модуля, что и настоящая сетка, поэтому число
 * колонок и размеры слотов при подстановке данных не меняются ни на пиксель.
 *
 * Заглушка декоративна: aria-hidden убирает её из дерева доступности целиком,
 * а о том, что идёт загрузка, скринридеру сообщает сам факт навигации.
 */
export default function WishlistLoading() {
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
				className="relative isolate overflow-hidden bg-[var(--void-deep)]"
				style={{
					marginTop: "calc(-1 * var(--sticky-header-height))",
					paddingTop: "var(--sticky-header-height)",
				}}
			>
				<div
					className="pointer-events-none absolute inset-0 -z-10"
					style={{
						background:
							"radial-gradient(110% 70% at 8% 100%, color-mix(in srgb, var(--primary) 13%, transparent) 0%, transparent 58%)",
					}}
				/>
				<div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[var(--rule)]" />

				<PageContainer className="flex flex-col pb-[clamp(2.5rem,5vw,4rem)] pt-[clamp(1.5rem,3vw,2.5rem)]">
					{/* Цепочка */}
					<div
						className={`${styles.skeletonBlock} ${styles.skeletonPulse}`}
						style={{ width: "11rem", height: "1.25rem" }}
					/>

					<div className="mt-[clamp(1.5rem,3vw,2.5rem)] flex flex-col gap-[clamp(1.75rem,3vw,3rem)] xl:flex-row xl:items-end xl:gap-[3rem]">
						{/*
						  Две строки заголовка. Высота каждой полоски выведена из
						  ИЗМЕРЕННОЙ строки настоящего заголовка: кегль — та же формула
						  clamp, что у h1, интерлиньяж — 0.92.

						  0.92, а НЕ 0.96 из класса leading-[0.96] на самом заголовке:
						  .u-display объявлен в home.css вне слоёв и перебивает
						  слоистую утилиту Tailwind (разбор — в шапке
						  app/(frontend)/globals.css). Здесь нужна та высота, которая
						  получается в браузере, а не та, которая написана в разметке.

						  Пробелы вокруг «+» и «−» обязательны: `0.6rem+4.4vw` внутри
						  clamp() — недействительное объявление, браузер молча
						  отбрасывает его целиком. Tailwind расставляет их сам, в
						  инлайновом стиле их приходится писать руками.

						  Высота стоит на самих полосках, а не на столбце: у столбца
						  класс flex-1, то есть flex-basis: 0 по ГЛАВНОЙ оси — а она
						  здесь вертикальная, и любая заданная столбцу высота
						  игнорируется.
						*/}
						<div className="flex min-w-0 flex-1 flex-col gap-[0.4rem]">
							<div
								className={`${styles.skeletonBlock} ${styles.skeletonPulse}`}
								style={{
									width: "min(9rem, 40%)",
									height:
										"calc(0.92 * clamp(1.625rem, 0.6rem + 4.4vw, 4.25rem) - 0.2rem)",
								}}
							/>
							<div
								className={`${styles.skeletonBlock} ${styles.skeletonPulse}`}
								style={{
									width: "min(26rem, 85%)",
									height:
										"calc(0.92 * clamp(1.625rem, 0.6rem + 4.4vw, 4.25rem) - 0.2rem)",
								}}
							/>
						</div>

						{/* Сводка первого экрана: две величины с подписями */}
						<div className="flex gap-[2.5rem] xl:w-[24rem] xl:shrink-0">
							{[0, 1].map((index) => (
								<div key={index} className="flex flex-col gap-[0.4rem]">
									<div
										className={`${styles.skeletonBlock} ${styles.skeletonPulse}`}
										style={{ width: "3rem", height: "1.75rem" }}
									/>
									<div
										className={`${styles.skeletonBlock} ${styles.skeletonPulse}`}
										style={{ width: "6.5rem", height: "0.625rem" }}
									/>
								</div>
							))}
						</div>
					</div>
				</PageContainer>
			</section>

			<PageContainer className="pb-[4rem]">
				<div className="flex flex-col">
					{/* Липкая панель: те же поля и те же волосяные границы */}
					<div className="mt-[2rem] flex items-center gap-3 border-y border-[var(--rule)] py-[0.75rem] sm:mt-[3rem]">
						<div
							className={`${styles.skeletonBlock} ${styles.skeletonPulse}`}
							style={{ width: "5.5rem", height: "0.875rem" }}
						/>
						<span className="flex-1" />
						<div
							className={`${styles.skeletonBlock} ${styles.skeletonPulse}`}
							style={{ width: "9.5rem", height: "2.25rem", borderRadius: 999 }}
						/>
					</div>

					<div className="mt-[2rem] sm:mt-[2.5rem]">
						<ProductGridSkeleton count={10} />
					</div>
				</div>
			</PageContainer>
		</main>
	);
}
