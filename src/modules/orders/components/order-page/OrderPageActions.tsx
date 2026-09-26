import { ArrowRight, PackageSearch, Star } from "lucide-react";
import Link from "next/link";
import { isOrderRepeatable } from "../../lib/status.groups";
import { ORDER_STATUS_VIEW } from "../../lib/status-view";
import type { OrderStatus } from "../../types";
import styles from "../Orders.module.css";
import { RepeatOrderAction } from "../RepeatOrderAction";

interface Props {
	orderId: string;
	status: OrderStatus;
}

/**
 * Что делать дальше.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ОДНО ГЛАВНОЕ ДЕЙСТВИЕ, А НЕ РЯД ОДИНАКОВЫХ КНОПОК
 * ────────────────────────────────────────────────────────────────────────────
 * Заказ уже оформлен — делать на этой странице нечего, и в этом всё дело:
 * набор равнозначных кнопок заставлял бы выбирать там, где выбора нет.
 * Поэтому одно выделенное действие и тихие рядом.
 *
 * Главное действие зависит от состояния заказа, и все варианты настоящие:
 *
 *  • полученный заказ — «Оценить товары». Раздел «Можно оценить» в кабинете
 *    существует и сам считает, что именно можно оценить (см. reviews.service);
 *    ссылка ведёт прямо в него, а не на общую страницу отзывов. Рядом —
 *    второстепенное «Повторить заказ»: купить то же ещё раз.
 *  • отменённый или возвращённый заказ — «Повторить заказ». Оценивать нечего,
 *    а оформить заново — ровно то, что обычно нужно после отмены.
 *  • заказ в работе — «Продолжить покупки». Сразу после оформления это
 *    единственное, что человеку действительно нужно: заказ он уже видит, а
 *    «Мои заказы» покажут ему ту же строку, что перед глазами. Повторять
 *    заказ, который ещё едет, рано (см. isOrderRepeatable).
 *
 * «Повторить заказ» кладёт позиции в корзину по текущему каталогу и
 * показывает на месте кнопки, чем результат отличается от заказа (см.
 * RepeatOrderAction). «Отследить посылку» система не поддерживает, и кнопки
 * для него нет: кнопка, которая ничего не делает, хуже её отсутствия.
 */
export function OrderPageActions({ orderId, status }: Props) {
	const isDelivered = ORDER_STATUS_VIEW[status].tone === "done";
	const isRepeatable = isOrderRepeatable(status);

	return (
		<div className={styles.pageActions}>
			{isDelivered ? (
				<Link
					href="/profile/reviews?status=to-review"
					className={`${styles.btn} ${styles.btnPrimary}`}
				>
					<Star size={16} aria-hidden />
					Оценить товары
				</Link>
			) : isRepeatable ? null : (
				<Link href="/category" className={`${styles.btn} ${styles.btnPrimary}`}>
					Продолжить покупки
					<ArrowRight size={16} aria-hidden />
				</Link>
			)}

			{isRepeatable && (
				<RepeatOrderAction
					orderId={orderId}
					variant={isDelivered ? "quiet" : "primary"}
				/>
			)}

			<Link href="/orders" className={`${styles.btn} ${styles.btnQuiet}`}>
				<PackageSearch size={16} aria-hidden />
				Все мои заказы
			</Link>
		</div>
	);
}
