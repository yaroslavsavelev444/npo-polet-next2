import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "@/utils/cn";
import type { PlaceholderValue } from "../content/home-content";
import { getImage } from "../lib/media";

/* ==========================================================================
   Пометка временных данных
   ========================================================================== */

/**
 * Оборачивает значение, которое ещё предстоит заменить реальным.
 *
 * В разработке подчёркивает его пунктиром и вешает title с подсказкой, откуда
 * взять настоящие данные. В продакшне — обычный текст без единого лишнего
 * атрибута: подсветка нужна тому, кто наполняет сайт, а не посетителю.
 *
 * Смысл в том, чтобы временные цифры нельзя было не заметить. Страница с
 * «0 000 изделий» выглядит законченной, и без явной пометки такие значения
 * доживают до продакшна.
 */
export function Placeholder({
	children,
	note,
	active = true,
	className,
}: {
	children: ReactNode;
	note?: string;
	active?: boolean;
	className?: string;
}) {
	if (!active || process.env.NODE_ENV === "production") {
		return <span className={className}>{children}</span>;
	}

	return (
		<span
			className={cn(
				"underline decoration-dashed decoration-[var(--warning)]/70 underline-offset-4",
				className,
			)}
			title={note ? `Временные данные — ${note}` : "Временные данные"}
		>
			{children}
		</span>
	);
}

/** Готовый рендер PlaceholderValue: значение плюс пометка, если нужна. */
export function Value({
	data,
	className,
}: {
	data: PlaceholderValue;
	className?: string;
}) {
	return (
		<Placeholder
			active={Boolean(data.placeholder)}
			note={data.note}
			className={className}
		>
			{data.value}
		</Placeholder>
	);
}

/* ==========================================================================
   Слот под медиа
   ========================================================================== */

/**
 * Показывает изображение из манифеста, а пока файла нет — честный слот:
 * тёмная панель с угловыми метками и подписью, какой файл сюда нужен.
 *
 * Почему не заглушка-фотография: стоковый кадр выглядит как контент и потому
 * переживает запуск. Пустая рамка с именем файла выглядит как незакрытая
 * задача, потому что она ею и является.
 */
export function MediaSlot({
	imageKey,
	className,
	imageClassName,
	sizes = "100vw",
	priority = false,
	/**
	 * Пропорция кадра. Применяется и к изображению, и к пустому слоту — иначе
	 * блок меняет высоту в момент, когда файл появляется.
	 *
	 * Передавайте ту же пропорцию, к которой приведён файл
	 * (scripts/prepare-home-images.py): тогда object-cover ничего не режет.
	 * Не указывайте, если высоту задаёт сам контейнер (className с absolute
	 * или явной высотой).
	 */
	aspect = "aspect-[4/3]",
}: {
	imageKey: string;
	className?: string;
	imageClassName?: string;
	sizes?: string;
	priority?: boolean;
	aspect?: string;
}) {
	const entry = getImage(imageKey);

	// Пропорция нужна ОБЕИМ веткам. Пропущенная в ветке с изображением, она
	// давала контейнер нулевой высоты: <Image fill> позиционируется абсолютно
	// и высоту родителю не задаёт, поэтому лента кадров производства
	// схлопывалась в полоску высотой 0, а на её месте оставался пустой отступ.
	//
	// Исключение — контейнер, который сам растянут (absolute inset-0) или
	// которому высота задана снаружи: там пропорция навязала бы свою.
	const sizedBySelf =
		className?.includes("absolute") || className?.includes("h-full");
	const frame = sizedBySelf ? undefined : aspect;

	if (entry?.available) {
		return (
			<div className={cn("relative overflow-hidden", frame, className)}>
				<Image
					src={entry.src}
					alt={entry.alt}
					fill
					sizes={sizes}
					priority={priority}
					className={cn("object-cover", imageClassName)}
				/>
			</div>
		);
	}

	return (
		<div
			className={cn(
				"relative overflow-hidden bg-[var(--void-deep)]",
				frame,
				className,
			)}
			// Слот — служебное состояние, а не контент: скринридеру он не
			// нужен, и объявлять «изображение отсутствует» смысла нет.
			aria-hidden="true"
		>
			{/* Диагональная штриховка — стандартная маркировка «место занято»
			    на чертеже. Рисуется градиентом: ни одного лишнего узла. */}
			<div
				className="absolute inset-0 opacity-[0.06]"
				style={{
					backgroundImage:
						"repeating-linear-gradient(135deg, var(--text-primary) 0 1px, transparent 1px 10px)",
				}}
			/>
			<div className="absolute inset-3 border border-dashed border-[var(--rule)]" />
			{process.env.NODE_ENV !== "production" && entry ? (
				<div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-4 text-center">
					<span className="u-mono text-[0.625rem] text-[var(--text-muted)]">
						{entry.src}
					</span>
					<span className="max-w-[28ch] text-[0.6875rem] leading-snug text-[var(--text-muted)]">
						{entry.brief}
					</span>
				</div>
			) : null}
		</div>
	);
}

/* ==========================================================================
   Каркас секции
   ========================================================================== */

/**
 * Общая обвязка секции главной: якорь для индекса, вертикальные отступы и
 * разлинованный верхний край.
 *
 * Отступы заданы через clamp, а не ступенями брейкпойнтов: ритм страницы
 * должен меняться непрерывно, иначе на 900px секции внезапно «схлопываются»
 * относительно 1000px.
 */
export function Section({
	id,
	children,
	className,
	ruled = true,
	tone = "base",
}: {
	id?: string;
	children: ReactNode;
	className?: string;
	/** Разлинованная черта по верхнему краю. */
	ruled?: boolean;
	tone?: "base" | "void" | "deep";
}) {
	const background =
		tone === "void"
			? "bg-[var(--void)]"
			: tone === "deep"
				? "bg-[var(--void-deep)]"
				: "";

	return (
		<section
			id={id}
			// scroll-margin-top — чтобы переход по якорю из индекса не заводил
			// заголовок под липкую шапку.
			className={cn(
				"relative scroll-mt-[var(--sticky-header-height)]",
				background,
				className,
			)}
		>
			{ruled ? (
				<div
					className="rule-ticked absolute inset-x-0 top-0"
					aria-hidden="true"
				/>
			) : null}
			{children}
		</section>
	);
}

/**
 * Внутренняя колонка секции. Ширину держит один общий контейнер, чтобы левый
 * край всех секций совпадал — на длинной странице несовпадение на 8px
 * читается как брак даже теми, кто не может его назвать.
 */
export function Container({
	children,
	className,
	wide = false,
}: {
	children: ReactNode;
	className?: string;
	wide?: boolean;
}) {
	return (
		<div
			className={cn(
				"mx-auto w-full px-[1.25rem] sm:px-[2rem] lg:px-[3rem]",
				wide ? "max-w-[110rem]" : "max-w-[80rem]",
				className,
			)}
		>
			{children}
		</div>
	);
}

/**
 * Заголовок секции.
 *
 * Надзаголовков-«кикеров» здесь нет намеренно: строка вроде «НАШИ
 * ПРЕИМУЩЕСТВА» мелким капслоком над заголовком ничего не добавляет к самому
 * заголовку. Ориентацию на странице даёт индекс секций слева, а не подпись
 * над каждым блоком.
 */
export function SectionHeading({
	title,
	intro,
	className,
	align = "start",
}: {
	title: string;
	intro?: string;
	className?: string;
	align?: "start" | "center";
}) {
	return (
		<div
			className={cn(
				"flex flex-col gap-4",
				align === "center" && "items-center text-center",
				className,
			)}
		>
			<h2 className="max-w-[18ch] text-[clamp(1.75rem,1.1rem+2.6vw,3.25rem)] font-bold tracking-[-0.025em] text-[var(--text-primary)]">
				{title}
			</h2>
			{intro ? (
				<p className="max-w-[52ch] text-[clamp(0.9375rem,0.88rem+0.25vw,1.0625rem)] leading-relaxed text-[var(--text-secondary)]">
					{intro}
				</p>
			) : null}
		</div>
	);
}
