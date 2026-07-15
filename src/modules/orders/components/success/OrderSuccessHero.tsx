import { Headset } from "lucide-react";
import type { OrderStatus } from "../../types";
import { OrderStatusBadge } from "../OrderStatusBadge";
import { ORDER_CARD_CLASS } from "../orderCard.styles";
import { OrderConfetti } from "./OrderConfetti";
import { SuccessCheckmark } from "./SuccessCheckmark";

interface OrderSuccessHeroProps {
	orderNumber: string;
	status: OrderStatus;
	phone: string;
	createdAt: string;
}

function formatDate(iso: string): string {
	return new Date(iso).toLocaleString("ru-RU", {
		day: "2-digit",
		month: "long",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

/**
 * Ключевой блок страницы: анимированная галочка, конфетти, сообщение об успехе,
 * номер/статус заказа и уведомление о звонке менеджера. Единственное «громкое»
 * место страницы — остальное намеренно спокойное.
 */
export function OrderSuccessHero({
	orderNumber,
	status,
	phone,
	createdAt,
}: OrderSuccessHeroProps) {
	return (
		<section className={`relative overflow-hidden ${ORDER_CARD_CLASS}`}>
			<OrderConfetti />

			{/* Мягкое свечение сверху */}
			<div
				aria-hidden
				className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_60%_100%_at_50%_0%,var(--success)/12,transparent_70%)]"
			/>

			<div className="relative z-10 flex flex-col items-center px-5 py-10 text-center sm:px-8 sm:py-14">
				<SuccessCheckmark />

				<h1 className="mt-6 text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">
					Заказ успешно оформлен
				</h1>
				<p className="mt-2 max-w-md text-sm text-[var(--text-secondary)] sm:text-base">
					Спасибо за заказ! Мы уже начали его обработку.
				</p>

				<div className="mt-6 flex flex-wrap items-center justify-center gap-3">
					<span className="inline-flex items-center gap-2 rounded-full border border-[var(--border-light)] bg-[var(--surface-secondary)] px-4 py-1.5 text-sm">
						<span className="text-[var(--text-secondary)]">Заказ</span>
						<span className="font-semibold tabular-nums text-[var(--text-primary)]">
							№ {orderNumber}
						</span>
					</span>
					<OrderStatusBadge status={status} />
				</div>

				<p className="mt-3 text-xs text-[var(--text-muted)]">
					от {formatDate(createdAt)}
				</p>

				{/* Уведомление о звонке менеджера */}
				<div className="mt-8 flex w-full max-w-lg items-start gap-3 rounded-[var(--radius-md)] border border-[var(--accent)]/25 bg-[var(--accent)]/8 p-4 text-left">
					<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/15 text-[var(--accent-light)]">
						<Headset size={17} aria-hidden />
					</span>
					<p className="text-sm leading-relaxed text-[var(--text-primary)]">
						В ближайшее время менеджер свяжется с вами по номеру{" "}
						<a
							href={`tel:${phone.replace(/[^\d+]/g, "")}`}
							className="font-semibold text-[var(--accent-light)] underline-offset-2 hover:underline"
						>
							{phone}
						</a>
						, чтобы уточнить детали и подтвердить заказ.
					</p>
				</div>
			</div>
		</section>
	);
}
