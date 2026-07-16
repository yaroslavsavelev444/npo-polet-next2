import { Check, Clock, X } from "lucide-react";
import { cn } from "@/utils/cn";
import { formatOrderShortDateTime } from "../lib/format-date";
import type { TimelineStep } from "../lib/status-flow";
import { ORDER_CARD_CLASS } from "./orderCard.styles";

interface OrderTimelineProps {
	steps: TimelineStep[];
}

const DOT_STYLES: Record<TimelineStep["state"], string> = {
	done: "border-[var(--success)] bg-[var(--success)]/15 text-[var(--success)]",
	current:
		"border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent-light)]",
	upcoming:
		"border-[var(--border-light)] bg-[var(--surface-secondary)] text-[var(--text-muted)]",
	cancelled: "border-[var(--error)] bg-[var(--error)]/15 text-[var(--error)]",
};

const LABEL_STYLES: Record<TimelineStep["state"], string> = {
	done: "text-[var(--text-primary)]",
	current: "text-[var(--text-primary)]",
	upcoming: "text-[var(--text-secondary)]",
	cancelled: "text-[var(--error)]",
};

function StepIcon({ state }: { state: TimelineStep["state"] }) {
	if (state === "cancelled") return <X size={13} aria-hidden />;
	if (state === "done") return <Check size={13} aria-hidden />;
	if (state === "current")
		return <span className="h-2 w-2 rounded-full bg-current" aria-hidden />;
	return <Clock size={12} aria-hidden />;
}

/**
 * Вертикальный timeline статусов заказа. Сценарий (какие шаги и в каком порядке)
 * рассчитывается в [[buildOrderTimeline]] — компонент только рисует состояние.
 */
export function OrderTimeline({ steps }: OrderTimelineProps) {
	return (
		<section className={`p-4 sm:p-5 ${ORDER_CARD_CLASS}`}>
			<h3 className="mb-4 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
				Статус заказа
			</h3>

			<ol className="flex flex-col">
				{steps.map((step, index) => {
					const isLast = index === steps.length - 1;
					const connectorDone = step.state === "done";
					return (
						<li key={`${step.status}-${index}`} className="flex gap-3">
							{/* Ось: точка + соединитель */}
							<div className="flex flex-col items-center">
								<span
									className={cn(
										"flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors",
										DOT_STYLES[step.state],
										step.state === "current" &&
											"ring-4 ring-[var(--accent)]/12",
									)}
								>
									<StepIcon state={step.state} />
								</span>
								{!isLast && (
									<span
										className={cn(
											"w-px flex-1",
											connectorDone
												? "bg-[var(--success)]/40"
												: "bg-[var(--border-light)]",
										)}
									/>
								)}
							</div>

							{/* Содержимое шага */}
							<div className={cn("min-w-0 flex-1", isLast ? "pb-0" : "pb-5")}>
								<div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
									<p
										className={cn(
											"text-sm font-medium",
											LABEL_STYLES[step.state],
										)}
									>
										{step.label}
									</p>
									{step.state === "current" && (
										<span className="rounded-full bg-[var(--accent)]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent-light)]">
											Сейчас
										</span>
									)}
									{step.at && (
										<span className="text-xs text-[var(--text-muted)]">
											{formatOrderShortDateTime(step.at)}
										</span>
									)}
								</div>
								<p className="mt-0.5 text-xs leading-relaxed text-[var(--text-secondary)]">
									{step.description}
								</p>
							</div>
						</li>
					);
				})}
			</ol>
		</section>
	);
}
