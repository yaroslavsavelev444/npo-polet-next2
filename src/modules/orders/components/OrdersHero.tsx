import {
	type BreadcrumbItem,
	Breadcrumbs,
} from "@/components/Breadcrumbs/Breadcrumbs";
import catalog from "@/modules/productCatalog/components/Catalog.module.css";
import { Reveal, RevealLines } from "@/shared/components/motion/Reveal";
import { PageContainer } from "@/shared/components/PageContainer";
import styles from "./Orders.module.css";

interface OrdersHeroProps {
	breadcrumbs: BreadcrumbItem[];
	/** Всего заказов у покупателя — по всем статусам. */
	totalOrders: number;
	/** Сколько из них сейчас в работе. */
	activeOrders: number;
}

function pluralOrders(count: number): string {
	const mod10 = count % 10;
	const mod100 = count % 100;
	if (mod10 === 1 && mod100 !== 11) return "заказ";
	if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20))
		return "заказа";
	return "заказов";
}

/**
 * Первый экран «Моих заказов».
 *
 * Та же полоса, что открывает кабинет, витрину каталога и контакты:
 * --void-deep во всю ширину, один радиальный источник снизу слева, волосяной
 * шов по нижнему краю. Переход «кабинет → заказы» не должен читаться как
 * переход на другой сайт.
 *
 * В правой колонке — две величины, ради которых сюда чаще всего и заходят:
 * сколько заказов всего и сколько из них в работе. Ответ на «где мой заказ»
 * начинается с «а есть ли он вообще в работе», и получить его нужно до того,
 * как начал читать список.
 *
 * Заголовок: самое длинное слово «ЗАКАЗЫ» — 6 знаков, ~6.8em. При верхней
 * границе кегля 4.25rem это 462px в колонке 800px, при нижней 1.625rem —
 * 177px при 288, доступных на экране 320px. Запас с обеих сторон; меняя
 * текст, его нужно пересчитать.
 */
export function OrdersHero({
	breadcrumbs,
	totalOrders,
	activeOrders,
}: OrdersHeroProps) {
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
						<RevealLines lines={["Мои", "заказы"]} stagger={120} />
					</h1>

					<Reveal delay={240} className="xl:w-[24rem] xl:shrink-0">
						<div className={styles.summary}>
							<div className={styles.summaryItem}>
								<span className={styles.summaryValue}>{totalOrders}</span>
								<span className={catalog.micro}>
									{pluralOrders(totalOrders)} всего
								</span>
							</div>

							<div className={styles.summaryItem}>
								<span
									className={`${styles.summaryValue} ${
										activeOrders > 0 ? styles.summaryValueAccent : ""
									}`}
								>
									{activeOrders}
								</span>
								<span className={catalog.micro}>в работе</span>
							</div>
						</div>
					</Reveal>
				</div>
			</PageContainer>
		</section>
	);
}

export default OrdersHero;
