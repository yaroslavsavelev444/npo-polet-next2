import type { ComponentType, ReactNode } from "react";

type IconType = ComponentType<{ size?: number; className?: string }>;

interface OrderFieldProps {
	icon: IconType;
	label: string;
	value: ReactNode;
	/** Делает значение ссылкой (tel:/mailto:/http). */
	href?: string;
}

/** Строка «иконка + подпись + значение» — общий примитив блоков заказа. */
export function OrderField({
	icon: Icon,
	label,
	value,
	href,
}: OrderFieldProps) {
	return (
		<div className="flex items-start gap-3">
			<span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--surface-secondary)] text-[var(--text-secondary)]">
				<Icon size={15} aria-hidden />
			</span>
			<div className="min-w-0 flex-1">
				<dt className="text-xs text-[var(--text-secondary)]">{label}</dt>
				{href ? (
					<a
						href={href}
						className="block break-words text-sm font-medium text-[var(--text-primary)] transition-colors hover:text-[var(--accent-light)]"
					>
						{value}
					</a>
				) : (
					<dd className="break-words text-sm font-medium text-[var(--text-primary)]">
						{value}
					</dd>
				)}
			</div>
		</div>
	);
}

interface OrderFieldGroupProps {
	title: string;
	children: ReactNode;
}

/** Группа полей с заголовком-подписью. */
export function OrderFieldGroup({ title, children }: OrderFieldGroupProps) {
	return (
		<div className="flex flex-col gap-3.5">
			<h3 className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
				{title}
			</h3>
			<dl className="flex flex-col gap-3.5">{children}</dl>
		</div>
	);
}
