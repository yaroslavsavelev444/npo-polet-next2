import { Headset } from "lucide-react";
import { formatOrderDateTime } from "../../lib/format-date";
import type { OrderStatus } from "../../types";
import { OrderStatusBadge } from "../OrderStatusBadge";
import styles from "../Orders.module.css";
import { OrderConfetti } from "./OrderConfetti";
import { SuccessCheckmark } from "./SuccessCheckmark";

interface OrderSuccessHeroProps {
	orderNumber: string;
	status: OrderStatus;
	/** Номер, который покупатель выбрал для связи по заказу. */
	phone: string;
	/** Выбран номер получателя, а не самого покупателя. */
	callsRecipient?: boolean;
	createdAt: string;
}

/**
 * Первый экран страницы заказа: подтверждение, номер, статус и обещание
 * звонка.
 *
 * Единственное «громкое» место страницы — остальное намеренно спокойное.
 * Громкость создают анимированная галочка и конфетти, а не заливка: полоса
 * стоит на общем фоне витрины и отбита сверху и снизу той же разлиновкой,
 * которой отбиты секции везде на сайте. Прежняя версия рисовала карточку на
 * --surface с рамкой — материал прежней версии витрины, из-за которого
 * страница заказа выглядела чужой рядом со списком заказов.
 *
 * Номер заказа набран моноширинным и увеличен: это то, что диктуют менеджеру,
 * и то, ради чего на страницу возвращаются.
 */
export function OrderSuccessHero({
	orderNumber,
	status,
	phone,
	callsRecipient = false,
	createdAt,
}: OrderSuccessHeroProps) {
	return (
		<section className="relative isolate overflow-hidden border-y border-[var(--rule)]">
			<OrderConfetti />

			{/* Один источник света снизу, как на остальных первых экранах сайта.
			    Здесь он зелёный: событие — успех, а не переход в раздел. */}
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 -z-10"
				style={{
					background:
						"radial-gradient(90% 80% at 50% 0%, color-mix(in srgb, var(--success) 10%, transparent) 0%, transparent 62%)",
				}}
			/>

			<div className="relative z-10 flex flex-col items-center px-[1rem] py-[clamp(2.5rem,6vw,4rem)] text-center">
				<SuccessCheckmark />

				<h1 className="mt-6 text-[clamp(1.375rem,1rem+1.6vw,2rem)] font-bold tracking-[-0.02em] text-[var(--text-primary)]">
					Заказ оформлен
				</h1>

				<p className={`${styles.orderNumber} mt-3 !text-[1.25rem]`}>
					<span className={styles.orderNumberPrefix}>Заказ №</span>
					{orderNumber}
				</p>

				<div className="mt-4 flex flex-wrap items-center justify-center gap-3">
					<OrderStatusBadge status={status} />
					<time dateTime={createdAt} className={styles.totalNote}>
						от {formatOrderDateTime(createdAt)}
					</time>
				</div>

				{/* Номер здесь — тот самый, который покупатель выбрал в форме.
				    Формулировка меняется вместе с выбором: обещать «свяжется с
				    вами», когда звонок уйдёт получателю, значит спутать двух
				    разных людей. */}
				<p
					className={`${styles.notice} mt-8 max-w-[34rem] text-left`}
					style={{
						borderColor: "color-mix(in srgb, var(--accent) 32%, transparent)",
						background: "color-mix(in srgb, var(--accent) 8%, transparent)",
					}}
				>
					<Headset
						size={16}
						aria-hidden
						className={styles.noticeIcon}
						style={{ color: "var(--accent-light)" }}
					/>
					<span>
						{callsRecipient
							? "В ближайшее время менеджер позвонит получателю по номеру "
							: "В ближайшее время менеджер свяжется с вами по номеру "}
						<a
							href={`tel:${phone.replace(/[^\d+]/g, "")}`}
							className={styles.fieldLink}
						>
							{phone}
						</a>
						, чтобы уточнить детали и подтвердить заказ.
					</span>
				</p>
			</div>
		</section>
	);
}
