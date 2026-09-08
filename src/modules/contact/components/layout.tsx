import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

/**
 * Каркас страницы контактов.
 *
 * Почему не переиспользуются Section/Container из modules/home: те служат
 * оглавлению главной (якорь под липкий индекс, три тональности фона, черта
 * .rule-ticked по верхнему краю) и тянут за собой её контент-модуль. Здесь
 * нужен более простой каркас — ширина колонки и вертикальный ритм, — а
 * зависимость страницы контактов от модуля главной означала бы, что правка
 * лендинга ломает контакты.
 *
 * Общее у них — не код, а значения: та же максимальная ширина, те же
 * горизонтальные отступы, тот же принцип clamp вместо ступеней брейкпойнтов
 * (ритм должен меняться непрерывно, иначе на 900px секции внезапно
 * «схлопываются» относительно 1000px).
 */

export function Section({
	id,
	children,
	className,
	tone = "deep",
}: {
	id?: string;
	children: ReactNode;
	className?: string;
	tone?: "void" | "deep";
}) {
	return (
		<section
			id={id}
			// scroll-margin-top — чтобы переход по якорю не заводил заголовок
			// под липкую шапку.
			className={cn(
				"relative scroll-mt-[var(--sticky-header-height)]",
				tone === "void" ? "bg-[var(--void)]" : "bg-[var(--void-deep)]",
				className,
			)}
		>
			{children}
		</section>
	);
}

/**
 * Внутренняя колонка. Ширину держит один общий контейнер, чтобы левый край
 * всех секций совпадал: на длинной странице расхождение в 8px читается как
 * брак даже теми, кто не может его назвать.
 */
export function Container({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"mx-auto w-full max-w-[80rem] px-[1.25rem] sm:px-[2rem] lg:px-[3rem]",
				className,
			)}
		>
			{children}
		</div>
	);
}

/**
 * Техническая подпись: тип канала, название реквизита, единица измерения.
 *
 * Моноширинный капслок здесь не «костюм технологичности», а прямая работа
 * шрифта: подписи стоят колонкой друг под другом слева от значений, и
 * одинаковая ширина знака выравнивает эту колонку без табличной вёрстки.
 */
export function MonoLabel({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"u-mono text-[0.6875rem] leading-none text-[var(--text-muted)]",
				className,
			)}
		>
			{children}
		</span>
	);
}

/**
 * Заголовок секции второго уровня. Набирается основной гарнитурой, а не
 * акцидентной: PaluiSP2 на странице появляется ровно дважды — в заголовке
 * страницы и в заголовке формы. Третий и четвёртый раз превратили бы приём в
 * оформление.
 */
export function SectionHeading({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<h2
			className={cn(
				"text-[clamp(1.375rem,1.05rem+1.3vw,2.125rem)] font-bold leading-[1.1] tracking-[-0.025em] text-[var(--text-primary)]",
				className,
			)}
		>
			{children}
		</h2>
	);
}
