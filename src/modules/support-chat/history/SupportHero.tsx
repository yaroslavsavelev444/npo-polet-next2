import type { ReactNode } from "react";
import {
	type BreadcrumbItem,
	Breadcrumbs,
} from "@/components/Breadcrumbs/Breadcrumbs";
import { Reveal, RevealLines } from "@/shared/components/motion/Reveal";
import { PageContainer } from "@/shared/components/PageContainer";

interface SupportHeroProps {
	breadcrumbs: BreadcrumbItem[];
	/** Правая колонка: состояние связи с менеджером и действие. */
	aside: ReactNode;
}

/**
 * Первый экран «Моих обращений».
 *
 * Та же полоса, что открывает кабинет, отзывы, заказы и контакты:
 * --void-deep во всю ширину, один радиальный источник снизу слева, волосяной
 * шов по нижнему краю. Раздел входит в тот же ярус кабинета и обязан иметь
 * тот же вес — иначе он читается как служебная страница.
 *
 * Заголовок акцидентной PaluiSP2, строки разбиты вручную. Самое длинное слово
 * — «ОБРАЩЕНИЯ», 9 знаков, ~10.4em: при верхней границе кегля 4.25rem это
 * ~707px в колонке 800px, при нижней 1.625rem — ~270px из 288, доступных на
 * экране 320px. Запас небольшой; меняя текст, его нужно пересчитать.
 */
export function SupportHero({ breadcrumbs, aside }: SupportHeroProps) {
	return (
		<section
			className="relative isolate overflow-hidden bg-[var(--void-deep)]"
			style={{
				// Шапка сайта — position: fixed; первый экран заезжает под неё,
				// спейсер компенсируется отрицательным полем.
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
						<RevealLines lines={["Мои", "обращения"]} stagger={120} />
					</h1>

					<Reveal delay={240} className="xl:w-[24rem] xl:shrink-0">
						{aside}
					</Reveal>
				</div>
			</PageContainer>
		</section>
	);
}
