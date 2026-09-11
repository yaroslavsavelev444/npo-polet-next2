"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import styles from "./Orders.module.css";

interface Props {
	page: number;
	totalPages: number;
	hasNextPage: boolean;
	hasPrevPage: boolean;
}

/**
 * Постраничная навигация.
 *
 * Две кнопки по краям и положение посередине: номеров страниц здесь нет
 * намеренно — заказы отсортированы по дате, и «страница 7» ничего не говорит
 * о том, что на ней. Ходят по такому списку подряд, а не прыжками.
 *
 * Прокрутка при переходе не сбрасывается (scroll: false), но список заведомо
 * меняется целиком, поэтому фокус уводится наверх списка средствами самой
 * навигации: следующая страница начинается с первой строки, а не с того
 * места, где стояла предыдущая.
 */
export function OrdersPagination({
	page,
	totalPages,
	hasNextPage,
	hasPrevPage,
}: Props) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const [isPending, startTransition] = useTransition();

	if (totalPages <= 1) return null;

	function goToPage(nextPage: number) {
		const params = new URLSearchParams(searchParams.toString());
		if (nextPage <= 1) params.delete("page");
		else params.set("page", String(nextPage));

		const query = params.toString();
		startTransition(() => {
			router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
			if (typeof window !== "undefined") {
				window.scrollTo({ top: 0, behavior: "smooth" });
			}
		});
	}

	return (
		<nav className={styles.pager} aria-label="Страницы заказов">
			<button
				type="button"
				disabled={!hasPrevPage || isPending}
				onClick={() => goToPage(page - 1)}
				className={`${styles.btn} ${styles.btnQuiet}`}
			>
				<ChevronLeft size={15} aria-hidden />
				Назад
			</button>

			<p className={styles.pagerLabel} aria-live="polite">
				{page} / {totalPages}
			</p>

			<button
				type="button"
				disabled={!hasNextPage || isPending}
				onClick={() => goToPage(page + 1)}
				className={`${styles.btn} ${styles.btnQuiet}`}
			>
				Вперёд
				<ChevronRight size={15} aria-hidden />
			</button>
		</nav>
	);
}

export default OrdersPagination;
