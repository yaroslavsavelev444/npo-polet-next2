import { ArrowRight, PackageSearch, Star } from "lucide-react";
import Link from "next/link";
import { ORDER_STATUS_VIEW } from "../../lib/status-view";
import type { OrderStatus } from "../../types";
import styles from "../Orders.module.css";

interface Props {
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
 * Поэтому одно выделенное действие и одна тихая ссылка рядом.
 *
 * Главное действие зависит от состояния заказа, и оба варианта настоящие:
 *
 *  • полученный заказ — «Оценить товары». Раздел «Можно оценить» в кабинете
 *    существует и сам считает, что именно можно оценить (см. reviews.service);
 *    ссылка ведёт прямо в него, а не на общую страницу отзывов.
 *  • во всех остальных состояниях — «Продолжить покупки». Сразу после
 *    оформления это единственное, что человеку действительно нужно: заказ он
 *    уже видит, а «Мои заказы» покажут ему ту же строку, что перед глазами.
 *
 * Выдуманных действий здесь нет: «повторить заказ» и «отследить посылку»
 * система не поддерживает, и кнопка, которая ничего не делает, хуже её
 * отсутствия.
 */
export function OrderPageActions({ status }: Props) {
	const isDelivered = ORDER_STATUS_VIEW[status].tone === "done";

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
			) : (
				<Link href="/category" className={`${styles.btn} ${styles.btnPrimary}`}>
					Продолжить покупки
					<ArrowRight size={16} aria-hidden />
				</Link>
			)}

			<Link href="/orders" className={`${styles.btn} ${styles.btnQuiet}`}>
				<PackageSearch size={16} aria-hidden />
				Все мои заказы
			</Link>
		</div>
	);
}
