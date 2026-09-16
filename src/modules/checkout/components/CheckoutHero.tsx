"use client";

import type { ReactNode } from "react";
import { formatPrice } from "@/modules/productCard";
import catalog from "@/modules/productCatalog/components/Catalog.module.css";
import { Reveal, RevealWords } from "@/shared/components/motion/Reveal";
import { PageContainer } from "@/shared/components/PageContainer";
import { pluralPositions } from "../lib/checkout-labels";
import styles from "./Checkout.module.css";

interface Props {
	/** Цепочка навигации, отрисованная на сервере. */
	breadcrumbs: ReactNode;
	positions: number;
	itemsQuantity: number;
	total: number;
	/** Идёт пересчёт — показанная сумма относится к прошлому состоянию. */
	isStale: boolean;
}

/**
 * Первый экран оформления заказа.
 *
 * Та же полоса, что открывает кабинет, витрину каталога и «Мои заказы»:
 * --void-deep во всю ширину, один радиальный источник снизу слева, волосяной
 * шов по нижнему краю. Переход «корзина → оформление» не должен читаться как
 * переход на другой сайт.
 *
 * Полоса намеренно НИЖЕ, чем у разделов кабинета: оформление — не витрина
 * раздела, а работа, и отдавать ей пол-экрана значило бы отодвигать первое
 * поле формы ниже сгиба на телефоне.
 *
 * Справа — две величины, ради которых на эту страницу и приходят: сколько
 * позиций в заказе и сколько он стоит прямо сейчас. Сумма живая: она меняется
 * вместе с количеством и промокодом, поэтому первый экран не устаревает в тот
 * момент, когда покупатель поправил корзину.
 *
 * Заголовок: самое длинное слово «ОФОРМЛЕНИЕ» — 10 знаков, ~12em у PaluiSP2.
 * При верхней границе кегля 3rem это 576px в колонке ~830px, при нижней
 * 1.375rem — 264px при 288, доступных на экране 320px. Запас с обеих сторон;
 * меняя текст, его нужно пересчитать.
 */
export function CheckoutHero({
	breadcrumbs,
	positions,
	itemsQuantity,
	total,
	isStale,
}: Props) {
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

			<PageContainer className="flex flex-col pb-[clamp(1.75rem,3.5vw,2.75rem)] pt-[clamp(1.25rem,2.5vw,2rem)]">
				{breadcrumbs}

				<div className="mt-[clamp(1.25rem,2.5vw,2rem)] flex flex-col gap-[clamp(1.25rem,2.5vw,2rem)] xl:flex-row xl:items-end xl:justify-between xl:gap-[3rem]">
					<h1 className="u-display min-w-0 flex-1 text-[clamp(1.375rem,0.8rem+2.9vw,3rem)] leading-[0.96] text-[var(--text-primary)]">
						<RevealWords text="Оформление заказа" stagger={110} />
					</h1>

					{/* Пустой заказ считать нечего: «0 позиций» и «0 ₽» — это не
					    сведения, а шум рядом с объяснением, что заказывать нечего. */}
					{positions > 0 && (
						<Reveal delay={220} className="xl:shrink-0">
							<dl className="flex items-end gap-[2rem]">
								<div className="flex flex-col gap-[0.35rem]">
									{/* Два разных счёта — наименований и штук. Разделены точкой:
								    «2 5 шт.» без разделителя читается как одно число. */}
									<dd className="order-2 m-0 text-[1.125rem] font-semibold tabular-nums text-[var(--text-primary)]">
										{positions}
										<span className="ml-1.5 text-[0.8125rem] font-normal text-[var(--text-secondary)]">
											· {itemsQuantity} шт.
										</span>
									</dd>
									<dt className={`order-1 ${catalog.micro}`}>
										{pluralPositions(positions)}
									</dt>
								</div>

								<div className="flex flex-col gap-[0.35rem]">
									<dd
										className={`order-2 m-0 text-[1.375rem] font-bold tabular-nums leading-none text-[var(--text-primary)] ${
											isStale ? styles.sumStale : ""
										}`}
									>
										{formatPrice(total)}
									</dd>
									<dt className={`order-1 ${catalog.micro}`}>к оплате</dt>
								</div>
							</dl>
						</Reveal>
					)}
				</div>
			</PageContainer>
		</section>
	);
}
