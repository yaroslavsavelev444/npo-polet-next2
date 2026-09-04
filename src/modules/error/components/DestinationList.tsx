import { ArrowUpRight, type LucideIcon } from "lucide-react";
import Link from "next/link";

export interface Destination {
	href: string;
	label: string;
	hint: string;
	icon: LucideIcon;
}

/**
 * Куда пользователь может уйти со страницы-тупика.
 *
 * Список, а не сетка одинаковых карточек: строки читаются сверху вниз за один
 * проход и не превращают служебную страницу в витрину. Разделители внутри
 * одной рамки — одна декларация уровня (граница), без второй тени.
 */
export function DestinationList({
	destinations,
	label = "Возможно, вам сюда",
}: {
	destinations: Destination[];
	label?: string;
}) {
	return (
		<section className="text-left">
			<h2 className="px-1 text-xs font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">
				{label}
			</h2>

			<ul className="mt-3 divide-y divide-[var(--border)] overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]">
				{destinations.map(({ href, label: title, hint, icon: Icon }) => (
					<li key={href}>
						<Link
							href={href}
							className="group flex items-center gap-3.5 !px-4 !py-3.5 transition-colors duration-200 hover:bg-[var(--surface-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--primary)]"
						>
							<Icon
								size={18}
								strokeWidth={1.75}
								aria-hidden
								className="shrink-0 text-[var(--text-muted)] transition-colors duration-200 group-hover:text-[var(--primary)]"
							/>

							<span className="min-w-0 flex-1">
								<span className="block text-sm font-medium text-[var(--text-primary)]">
									{title}
								</span>
								<span className="block truncate text-xs text-[var(--text-secondary)]">
									{hint}
								</span>
							</span>

							<ArrowUpRight
								size={16}
								aria-hidden
								className="shrink-0 text-[var(--text-muted)] transition-[transform,color] duration-200 ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[var(--primary)]"
							/>
						</Link>
					</li>
				))}
			</ul>
		</section>
	);
}

export default DestinationList;
