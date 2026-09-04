import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

export type ErrorAccent = "primary" | "error";

export interface ErrorViewProps {
	/** HTTP-код. Крупно печатается водяным знаком за заголовком. */
	code: string;
	title: string;
	description: ReactNode;
	/** Кнопки действий (клиентские — «Назад», «Повторить» и т.п.). */
	actions?: ReactNode;
	/** Нижний блок навигации: куда пользователь может пойти отсюда. */
	footer?: ReactNode;
	accent?: ErrorAccent;
	className?: string;
}

const ACCENT_COLOR: Record<ErrorAccent, string> = {
	primary: "var(--primary)",
	error: "var(--error)",
};

/**
 * Общая оболочка страниц состояния (404, 500).
 *
 * Один компонент на все входные точки — и на `not-found.tsx` внутри layout'а
 * витрины, и на `app/global-not-found.tsx`, который Next рендерит для
 * несуществующих маршрутов в обход layout'ов (у проекта два корневых layout'а:
 * витрина и админка Payload, поэтому единый корневой not-found.tsx невозможен —
 * см. node_modules/next/dist/docs/.../file-conventions/not-found.md).
 *
 * Серверный компонент: интерактивность приходит только через слоты `actions`.
 */
export function ErrorView({
	code,
	title,
	description,
	actions,
	footer,
	accent = "primary",
	className,
}: ErrorViewProps) {
	return (
		<main
			className={cn(
				"mx-auto flex w-full max-w-2xl flex-col items-center px-4 py-16 text-center sm:py-24",
				className,
			)}
		>
			{/* Водяной знак центрируется по ЗАГОЛОВКУ, а не по всему блоку: высота
          блока зависит от длины описания и набора кнопок, поэтому при
          центрировании по нему цифра уезжала бы то на текст, то под кнопки —
          и по-разному на каждой странице состояния. */}
			<div className="relative">
				{/* Код ошибки водяным знаком — тот же приём, что у монограммы на
            странице входа (AuthShell). Он несёт техническую информацию, не
            занимая места в иерархии: заголовок остаётся первым, что читают.
            aria-hidden — код продублирован в <title> и не нужен скринридеру
            дважды. */}
				<span
					aria-hidden
					className="pointer-events-none absolute left-1/2 top-1/2 -z-10 -translate-x-1/2 -translate-y-1/2 select-none font-semibold leading-none"
					style={{
						fontSize: "clamp(6rem, 22vw, 12rem)",
						letterSpacing: "-0.05em",
						color: ACCENT_COLOR[accent],
						opacity: 0.1,
					}}
				>
					{code}
				</span>

				<h1
					className="reveal-up text-balance text-3xl font-semibold leading-[1.1] tracking-[-0.03em] text-[var(--text-primary)] sm:text-5xl"
					style={{ ["--reveal-delay" as string]: "40ms" }}
				>
					{title}
				</h1>
			</div>

			<p
				className="reveal-up mt-5 max-w-[46ch] text-pretty text-base leading-relaxed text-[var(--text-secondary)]"
				style={{ ["--reveal-delay" as string]: "110ms" }}
			>
				{description}
			</p>

			{actions && (
				<div
					className="reveal-up mt-8 flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center"
					style={{ ["--reveal-delay" as string]: "180ms" }}
				>
					{actions}
				</div>
			)}

			{footer && (
				<div
					className="reveal-up mt-14 w-full"
					style={{ ["--reveal-delay" as string]: "250ms" }}
				>
					{footer}
				</div>
			)}
		</main>
	);
}

export default ErrorView;
