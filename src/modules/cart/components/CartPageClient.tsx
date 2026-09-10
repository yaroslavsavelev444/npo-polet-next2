"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useCartPanel } from "../store/cart-panel.store";
import type { CartView } from "../types";
import styles from "./Cart.module.css";
import { CartEmpty } from "./CartEmpty";
import { CartLineItem } from "./CartLineItem";
import {
	CartErrorNotice,
	CartUnavailableNotice,
	CartValidationNotice,
} from "./CartNotices";
import { CartProgress } from "./CartProgress";
import { CartSkeleton } from "./CartSkeleton";
import { CartSummary } from "./CartSummary";

interface CartPageClientProps {
	/**
	 * Состав корзины с сервера. У гостя его нет и быть не может — его корзина
	 * живёт в браузере, — поэтому null, и состав приезжает из localStorage уже
	 * на клиенте.
	 */
	initialCart: CartView | null;
	categories: { id: string; name: string; slug: string }[];
	userId: string | null;
	onboardingSeen: boolean;
}

/**
 * Страница корзины.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЗАЧЕМ ОНА, ЕСЛИ ЕСТЬ ПАНЕЛЬ
 * ────────────────────────────────────────────────────────────────────────────
 * Панель шириной в 28rem хороша, пока позиций немного. Заказ на два десятка
 * наименований разбирают иначе: видят всё сразу, сверяют количества, считают
 * итог — для этого нужна ширина экрана. Плюс на страницу ведут прямые ссылки
 * и возврат с оформления, когда корзина опустела.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ОДИН ИСТОЧНИК ДАННЫХ
 * ────────────────────────────────────────────────────────────────────────────
 * Страница не держит собственного состояния корзины. Она наполняет общий стор
 * серверными данными и дальше читает его же — как и панель, и значок в шапке.
 * Иначе изменение количества здесь не доезжало бы до открытой панели, а
 * добавление из каталога — до страницы.
 */
export function CartPageClient({
	initialCart,
	categories,
	userId,
	onboardingSeen,
}: CartPageClientProps) {
	const init = useCartPanel((s) => s.init);
	const view = useCartPanel((s) => s.view);
	const error = useCartPanel((s) => s.error);
	const pending = useCartPanel((s) => s.pending);
	const isMutating = useCartPanel((s) => s.isMutating);
	const isGuest = useCartPanel((s) => s.isGuest);
	const status = useCartPanel((s) => s.status);
	const refresh = useCartPanel((s) => s.refresh);
	const setQuantity = useCartPanel((s) => s.setQuantity);
	const remove = useCartPanel((s) => s.remove);
	const clear = useCartPanel((s) => s.clear);

	const router = useRouter();
	const [isCheckingOut, setIsCheckingOut] = useState(false);

	// Серверные данные заезжают в стор синхронно, до первой отрисовки: иначе
	// на кадр показалась бы пустая корзина, а затем — настоящая.
	const seeded = useRef(false);
	if (!seeded.current) {
		seeded.current = true;
		init({ userId, onboardingSeen, initialView: initialCart ?? undefined });
	}

	// Гостю состав считает сервер по списку из localStorage. Запрос уходит
	// один раз при заходе на страницу; дальше состояние держит стор.
	useEffect(() => {
		if (userId) return;
		void refresh({ silent: Boolean(useCartPanel.getState().view) });
	}, [userId, refresh]);

	const cart = view ?? initialCart;

	// Пока гостевая корзина считается, на месте списка стоит заглушка: показать
	// «здесь пусто» человеку, у которого в корзине три товара, — худшее из
	// возможных первых впечатлений.
	if (!cart) {
		return (
			<div className={styles.page}>
				<header className={styles.pageHead}>
					<h1 className={styles.pageTitle}>Корзина</h1>
				</header>
				<div className={styles.pageList} aria-busy={status === "loading"}>
					<CartSkeleton />
				</div>
			</div>
		);
	}

	const items = cart.items;

	if (items.length === 0) {
		return (
			<div className={styles.page}>
				<header className={styles.pageHead}>
					<h1 className={styles.pageTitle}>Корзина</h1>
				</header>
				<div className={styles.pageEmpty}>
					<CartEmpty categories={categories} onNavigate={() => {}} />
				</div>
			</div>
		);
	}

	return (
		<div className={styles.page}>
			<header className={styles.pageHead}>
				<h1 className={styles.pageTitle}>Корзина</h1>
				<p className={styles.pageCount}>
					{cart.summary.itemsCount}{" "}
					{pluralizePositions(cart.summary.itemsCount)} ·{" "}
					{cart.summary.totalItems} шт.
				</p>
			</header>

			<div className={styles.pageGrid}>
				<div>
					{error && (
						<CartErrorNotice message={error} onRetry={() => void refresh()} />
					)}
					{cart.unavailable.length > 0 && (
						<CartUnavailableNotice items={cart.unavailable} />
					)}
					{!cart.validation.isValid && (
						<CartValidationNotice issues={cart.validation.issues} />
					)}

					<div className={styles.pageList}>
						<ul className={styles.list}>
							{items.map((item, index) => (
								<CartLineItem
									key={item.product.id}
									item={item}
									index={index}
									operation={pending[item.product.id]}
									onQuantityChange={(quantity) =>
										void setQuantity(item.product.id, quantity)
									}
									onRemove={() => void remove(item.product.id)}
								/>
							))}
						</ul>
					</div>
				</div>

				<aside className={styles.pageAside}>
					<CartProgress
						discounts={cart.discounts}
						appliedAmount={cart.summary.centralDiscountAmount}
					/>
					<CartSummary
						summary={cart.summary}
						isValid={cart.validation.isValid}
						isStale={isMutating}
						isGuest={isGuest}
						isCheckingOut={isCheckingOut}
						onCheckout={() => {
							setIsCheckingOut(true);
							router.push(isGuest ? "/auth/login?from=/checkout" : "/checkout");
						}}
						onClear={() => void clear()}
					/>
				</aside>
			</div>
		</div>
	);
}

function pluralizePositions(count: number): string {
	const mod10 = count % 10;
	const mod100 = count % 100;
	if (mod100 >= 11 && mod100 <= 14) return "позиций";
	if (mod10 === 1) return "позиция";
	if (mod10 >= 2 && mod10 <= 4) return "позиции";
	return "позиций";
}
