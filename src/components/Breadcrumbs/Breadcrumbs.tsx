/**
 * components/Breadcrumbs/Breadcrumbs.tsx
 *
 * Навигационная цепочка. Раньше это была обёртка над antd Breadcrumb внутри
 * скруглённой «таблетки» с блюром и тенью: на странице товара она разрасталась
 * в двухстрочный серый блок во всю ширину и перетягивала на себя внимание,
 * хотя это вспомогательная навигация. Здесь — только семантика (nav > ol > li)
 * и типографика; ни контейнера, ни фона, ни рамок.
 *
 * На узком экране остаётся ровно одно звено — родительский раздел, поданный
 * как ссылка «назад». Текущая страница оттуда убрана намеренно: её название
 * стоит заголовком строкой ниже, и в цепочке оно только переносилось на
 * вторую строку. Скрытые звенья не выкидываются из разметки, а прячутся
 * классом sr-only: визуально их нет, но скринридер и краулер читают цепочку
 * целиком. Никакого клиентского JS и никакой развилки рендера — значит, нет и
 * расхождения с SSR.
 *
 * Компонент серверный: это убирает antd из клиентского бандла всех страниц,
 * где показывается цепочка.
 */

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

export interface BreadcrumbItem {
	title: ReactNode;
	/** Без href элемент рендерится как текущая страница (последний в цепочке). */
	href?: string;
}

interface BreadcrumbsProps {
	items: BreadcrumbItem[];
	className?: string;
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
	if (items.length === 0) return null;

	// Единственное звено, видимое на узком экране: родитель текущей страницы
	// (а если цепочка из одного элемента — он сам).
	const mobileVisibleIndex = Math.max(0, items.length - 2);

	return (
		<nav
			aria-label="Навигационная цепочка"
			className={cn("text-[13px] leading-5", className)}
		>
			<ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
				{items.map((item, index) => {
					const isLast = index === items.length - 1;
					const isMobileVisible = index === mobileVisibleIndex;

					return (
						<li
							key={`${index}-${item.href ?? "current"}`}
							className={cn(
								"flex min-w-0 items-center gap-1.5",
								!isMobileVisible && "sr-only sm:not-sr-only sm:flex",
							)}
						>
							{/* На мобильном единственное видимое звено читается как
							    «назад», поэтому стрелка перед ним смотрит влево. */}
							{isMobileVisible && index > 0 && (
								<ChevronLeft
									aria-hidden="true"
									className="h-4 w-4 shrink-0 text-[var(--text-muted)] sm:hidden"
								/>
							)}

							{index > 0 && (
								<ChevronRight
									aria-hidden="true"
									className="hidden h-3.5 w-3.5 shrink-0 text-[var(--border-light)] sm:block"
								/>
							)}

							{isLast || !item.href ? (
								<span
									aria-current={isLast ? "page" : undefined}
									// Последним звеном обычно идёт название товара — оно бывает
									// в сотню символов. Обрезаем по ширине, а не по числу
									// строк: цепочка обязана оставаться однострочной.
									className="max-w-[14rem] truncate text-[var(--text-secondary)] sm:max-w-[20rem] lg:max-w-[30rem]"
									title={
										typeof item.title === "string" ? item.title : undefined
									}
								>
									{item.title}
								</span>
							) : (
								<Link
									href={item.href}
									className="max-w-[18rem] truncate rounded-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] sm:max-w-none"
								>
									{item.title}
								</Link>
							)}
						</li>
					);
				})}
			</ol>
		</nav>
	);
}

export const createBreadcrumbItem = (
	title: ReactNode,
	href?: string,
): BreadcrumbItem => ({ title, href });

export default Breadcrumbs;
