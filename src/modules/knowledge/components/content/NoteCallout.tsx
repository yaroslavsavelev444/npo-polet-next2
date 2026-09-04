import { AlertTriangle, Info, Lightbulb, type LucideIcon } from "lucide-react";
import { cn } from "@/utils/cn";

type NoteVariant = "info" | "warning" | "tip";

const VARIANTS: Record<
	NoteVariant,
	{ icon: LucideIcon; surface: string; accent: string; fallbackTitle: string }
> = {
	info: {
		icon: Info,
		surface: "border-[var(--border-light)] bg-[var(--surface)]",
		accent: "text-[var(--accent)]",
		fallbackTitle: "Примечание",
	},
	warning: {
		icon: AlertTriangle,
		surface: "border-[var(--warning)]/35 bg-[var(--warning)]/8",
		accent: "text-[var(--warning)]",
		fallbackTitle: "Внимание",
	},
	tip: {
		icon: Lightbulb,
		surface: "border-[var(--primary)]/35 bg-[var(--primary)]/8",
		accent: "text-[var(--primary)]",
		fallbackTitle: "Совет",
	},
};

/**
 * Врезка внутри статьи.
 *
 * Иконка и фон, а не цветная полоса слева: полоса читается как декор и на
 * узком экране схлопывается в незаметную чёрточку, тогда как иконка остаётся
 * различимой при любой ширине и сама называет тип врезки.
 */
export function NoteCallout({
	variant = "info",
	title,
	text,
}: {
	variant?: NoteVariant;
	title?: string | null;
	text: string;
}) {
	const config = VARIANTS[variant] ?? VARIANTS.info;
	const Icon = config.icon;

	return (
		<aside
			className={cn(
				"my-7 flex gap-3.5 rounded-[var(--radius-md)] border !p-4 sm:!p-5",
				config.surface,
			)}
		>
			<Icon
				size={18}
				strokeWidth={1.9}
				aria-hidden
				className={cn("mt-0.5 shrink-0", config.accent)}
			/>

			<div className="min-w-0 flex-1">
				<p className={cn("text-sm font-semibold", config.accent)}>
					{title || config.fallbackTitle}
				</p>
				<p className="mt-1 whitespace-pre-line text-[0.9375rem] leading-relaxed text-[var(--text-primary)]">
					{text}
				</p>
			</div>
		</aside>
	);
}
