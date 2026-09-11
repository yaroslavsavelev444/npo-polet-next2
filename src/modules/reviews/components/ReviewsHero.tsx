import type { ReactNode } from "react";
import {
	type BreadcrumbItem,
	Breadcrumbs,
} from "@/components/Breadcrumbs/Breadcrumbs";
import { Reveal, RevealLines } from "@/shared/components/motion/Reveal";
import { PageContainer } from "@/shared/components/PageContainer";

interface ReviewsHeroProps {
	/** Заголовок, разбитый на строки вручную. */
	titleLines: string[];
	breadcrumbs: BreadcrumbItem[];
	/** Правая колонка: сводка рейтинга или личная статистика. */
	aside: ReactNode;
}

/**
 * Первый экран обеих страниц отзывов.
 *
 * Общий компонент, потому что общая у страниц именно шапка: полоса
 * --void-deep во всю ширину, один радиальный источник снизу слева, волосяной
 * шов по нижнему краю — ровно как на витрине каталога, в кабинете и в
 * заказах. Отличается только содержимое правой колонки, и оно приходит
 * пропсом.
 *
 * Заголовок акцидентной PaluiSP2, строки разбиты вручную. Самое длинное слово
 * из обоих заголовков — «ОТЗЫВЫ», 6 знаков, ~6.8em: при верхней границе кегля
 * 4.25rem это 462px в колонке 800px, при нижней 1.625rem — 177px при 288,
 * доступных на экране 320px. Запас с обеих сторон; меняя текст, его нужно
 * пересчитать.
 */
export function ReviewsHero({
	titleLines,
	breadcrumbs,
	aside,
}: ReviewsHeroProps) {
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
						<RevealLines lines={titleLines} stagger={120} />
					</h1>

					<Reveal delay={240} className="xl:w-[26rem] xl:shrink-0">
						{aside}
					</Reveal>
				</div>
			</PageContainer>
		</section>
	);
}

export default ReviewsHero;
