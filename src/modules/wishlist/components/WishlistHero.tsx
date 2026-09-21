"use client";

import {
	type BreadcrumbItem,
	Breadcrumbs,
} from "@/components/Breadcrumbs/Breadcrumbs";
import catalog from "@/modules/productCatalog/components/Catalog.module.css";
import { Reveal, RevealLines } from "@/shared/components/motion/Reveal";
import { PageContainer } from "@/shared/components/PageContainer";
import { pluralizeProducts } from "../lib/format";
import styles from "./Wishlist.module.css";

interface WishlistHeroProps {
	breadcrumbs: BreadcrumbItem[];
	/** Сколько позиций отложено сейчас. Меняется прямо на странице. */
	total: number;
	/** Сколько из них можно заказать без ожидания. */
	available: number;
}

/**
 * Первый экран избранного.
 *
 * Та же полоса, что открывает кабинет, заказы, отзывы и витрину каталога:
 * --void-deep во всю ширину, один радиальный источник снизу слева, волосяной
 * шов по нижнему краю. Переход «кабинет → избранное» не должен читаться как
 * переход на другой сайт.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПРАВАЯ КОЛОНКА
 * ────────────────────────────────────────────────────────────────────────────
 * Две величины, и вторая важнее, чем кажется. «Сколько отложено» посетитель
 * и так увидит по сетке; «сколько из этого есть в наличии» — нет, потому что
 * состояние написано на каждой карточке по отдельности. Избранное копится
 * месяцами, и вопрос «что из этого ещё можно взять» возникает раньше, чем
 * посетитель начал разглядывать позиции.
 *
 * На пустом списке пары чисел нет вовсе: «0 и 0» — не сводка, а подтверждение
 * пустоты, которое и так даёт блок ниже. Вместо неё стоит строка о том, как
 * список наполняется.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЗАГОЛОВОК
 * ────────────────────────────────────────────────────────────────────────────
 * Акцидентная PaluiSP2, строки разбиты вручную — как в кабинете, заказах и
 * отзывах. Самое длинное слово, «ИЗБРАННОЕ», это 9 знаков, у этой гарнитуры
 * ~10.2em: при верхней границе кегля 4.25rem — 694px в колонке 752px, при
 * нижней 1.625rem — 265px при 288, доступных на экране 320px. Запас с обеих
 * сторон невелик, поэтому, меняя текст, его нужно пересчитать; страховкой
 * остаётся словарный перенос из .u-display.
 *
 * Компонент клиентский, потому что числа живые: карточку убирают сердечком
 * прямо на этой странице, и сводка обязана меняться вместе с сеткой.
 */
export function WishlistHero({
	breadcrumbs,
	total,
	available,
}: WishlistHeroProps) {
	return (
		<section
			className="relative isolate overflow-hidden bg-[var(--void-deep)]"
			style={{
				// Шапка сайта — position: fixed, её место в потоке держит
				// HeaderSpacer. Первый экран заезжает ПОД неё, поэтому спейсер
				// компенсируется отрицательным полем, а содержимое возвращается
				// вниз таким же паддингом.
				marginTop: "calc(-1 * var(--sticky-header-height))",
				paddingTop: "var(--sticky-header-height)",
			}}
		>
			<div
				className="pointer-events-none absolute inset-0 -z-10"
				aria-hidden="true"
				style={{
					background:
						"radial-gradient(110% 70% at 8% 100%, color-mix(in srgb, var(--primary) 13%, transparent) 0%, transparent 58%)",
				}}
			/>
			<div
				className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[var(--rule)]"
				aria-hidden="true"
			/>

			<PageContainer className="flex flex-col pb-[clamp(2.5rem,5vw,4rem)] pt-[clamp(1.5rem,3vw,2.5rem)]">
				<Breadcrumbs items={breadcrumbs} />

				<div className="mt-[clamp(1.5rem,3vw,2.5rem)] flex flex-col gap-[clamp(1.75rem,3vw,3rem)] xl:flex-row xl:items-end xl:gap-[3rem]">
					<h1 className="u-display min-w-0 flex-1 text-[clamp(1.625rem,0.6rem+4.4vw,4.25rem)] leading-[0.96] text-[var(--text-primary)]">
						<RevealLines lines={["Моё", "избранное"]} stagger={120} />
					</h1>

					<Reveal delay={240} className="xl:w-[24rem] xl:shrink-0">
						{total > 0 ? (
							<div className={styles.summary}>
								<div className={styles.summaryItem}>
									<span className={styles.summaryValue}>{total}</span>
									<span className={catalog.micro}>
										{pluralizeProducts(total)} отложено
									</span>
								</div>

								<div className={styles.summaryItem}>
									<span
										className={`${styles.summaryValue} ${
											available > 0 ? styles.summaryValueAccent : ""
										}`}
									>
										{available}
									</span>
									<span className={catalog.micro}>в наличии</span>
								</div>
							</div>
						) : (
							<p className={styles.summaryNote}>
								Сюда попадают товары, отмеченные сердечком на карточке.
								Избранное привязано к аккаунту и сохраняется между заходами.
							</p>
						)}
					</Reveal>
				</div>
			</PageContainer>
		</section>
	);
}

export default WishlistHero;
