import { Check, Circle, Clock, X } from "lucide-react";
import { formatOrderShortDateTime } from "../lib/format-date";
import type { TimelineStep } from "../lib/status-flow";
import styles from "./Orders.module.css";

interface OrderTimelineProps {
	steps: TimelineStep[];
}

function StepIcon({ state }: { state: TimelineStep["state"] }) {
	if (state === "cancelled") return <X size={12} aria-hidden />;
	if (state === "done") return <Check size={12} aria-hidden />;
	if (state === "current")
		return <Circle size={8} aria-hidden fill="currentColor" />;
	return <Clock size={11} aria-hidden />;
}

const STATE_TEXT: Record<TimelineStep["state"], string> = {
	done: "пройден",
	current: "текущий этап",
	upcoming: "предстоит",
	cancelled: "заказ остановлен",
};

/**
 * Путь заказа: пройденные шаги, текущий и предстоящие.
 *
 * Сценарий (какие шаги и в каком порядке) рассчитывает buildOrderTimeline —
 * компонент только рисует состояние. Разные способы получения проходят разный
 * путь, и у оплаты по счёту в начале появляется лишний шаг; здесь об этом
 * знать не нужно.
 *
 * Состояние шага проговаривается словом в скрытой подписи: точка с галочкой
 * отличается от точки с часами силуэтом, но для скринридера обе — просто
 * элемент списка, и без текста порядок «что уже было» пропадает.
 */
export function OrderTimeline({ steps }: OrderTimelineProps) {
	return (
		<ol className={styles.timeline}>
			{steps.map((step, index) => (
				<li
					key={`${step.status}-${index}`}
					className={styles.step}
					data-state={step.state}
				>
					<span className={styles.stepDot} aria-hidden>
						<StepIcon state={step.state} />
					</span>

					<div className={styles.stepBody}>
						<div className={styles.stepHead}>
							<p className={styles.stepLabel}>
								{step.label}
								<span className="sr-only"> — {STATE_TEXT[step.state]}</span>
							</p>
							{step.state === "current" && (
								<span className={styles.stepNow} aria-hidden>
									Сейчас
								</span>
							)}
							{step.at && (
								<time dateTime={step.at} className={styles.stepAt}>
									{formatOrderShortDateTime(step.at)}
								</time>
							)}
						</div>
						<p className={styles.stepText}>{step.description}</p>
					</div>
				</li>
			))}
		</ol>
	);
}

export default OrderTimeline;
