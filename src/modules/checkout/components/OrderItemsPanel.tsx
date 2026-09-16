"use client";

import { ImageOff, PackageX, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type {
	CartItemView,
	CartUnavailableItem,
	CartView,
} from "@/modules/cart";
import { CartQuantityStepper } from "@/modules/cart/components/CartQuantityStepper";
import type { CartItemOperation } from "@/modules/cart/store/cart-panel.store";
import { formatPrice, getProductHref } from "@/modules/productCard";
import styles from "./Checkout.module.css";

interface Props {
	items: CartItemView[];
	unavailable: CartUnavailableItem[];
	validation: CartView["validation"];
	/** Какие позиции сейчас записываются на сервер. */
	pending: Record<string, CartItemOperation>;
	onQuantityChange: (productId: string, quantity: number) => void;
	onRemove: (productId: string) => void;
}

/**
 * Состав заказа — с возможностью поправить его на месте.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ КОЛИЧЕСТВО МЕНЯЕТСЯ ЗДЕСЬ, А НЕ ТОЛЬКО В КОРЗИНЕ
 * ────────────────────────────────────────────────────────────────────────────
 * Прежде состав был картинкой: чтобы убрать лишнюю позицию, нужно было уйти
 * в корзину и вернуться — то есть покинуть наполовину заполненную форму.
 * Человек либо оформлял заказ с лишним товаром, либо терял введённые данные.
 *
 * Правка идёт через тот же стор корзины, что и на странице корзины, и через
 * те же server actions. Второй реализации правил количества здесь нет: сервер
 * возвращает пересчитанную корзину целиком, и именно она становится
 * источником сумм на всей странице. Промокод после этого перепроверяется
 * заново (см. CheckoutPageClient) — скидка, посчитанная от прежнего состава,
 * не имеет права дожить до подтверждения заказа.
 *
 * Счётчик переиспользуется из корзины: он уже умеет главное — не отправлять
 * промежуточные значения при наборе числа руками («12» набирается через «1»)
 * и превращать «−» на минимуме в удаление.
 */
export function OrderItemsPanel({
	items,
	unavailable,
	validation,
	pending,
	onQuantityChange,
	onRemove,
}: Props) {
	const issueByProduct = new Map(
		validation.issues.map((issue) => [issue.productId, issue]),
	);

	return (
		<>
			<ul className={styles.items}>
				{items.map((item) => (
					<OrderItemRow
						key={item.product.id}
						item={item}
						operation={pending[item.product.id]}
						issueMessage={issueByProduct.get(item.product.id)?.message}
						onQuantityChange={(quantity) =>
							onQuantityChange(item.product.id, quantity)
						}
						onRemove={() => onRemove(item.product.id)}
					/>
				))}
			</ul>

			{unavailable.length > 0 && (
				// Снятые с продажи позиции не исчезают молча: покупатель их
				// выбирал, и пропажа строки читается как ошибка приложения, а не
				// как «товар сняли с продажи». В расчёт они не входят.
				<div className={`${styles.notice} ${styles.noticeWarn}`}>
					<PackageX size={15} aria-hidden className={styles.noticeIcon} />
					<span>
						<strong>
							{unavailable.length === 1
								? "Одна позиция больше не продаётся"
								: `Позиций больше не продаётся: ${unavailable.length}`}
						</strong>{" "}
						{unavailable.length === 1
							? "и не войдёт в заказ:"
							: "— они не войдут в заказ:"}
						<ul className={styles.gone}>
							{unavailable.map((entry) => (
								<li key={entry.productId} className={styles.goneItem}>
									{entry.title ?? "Товар снят с продажи"}
								</li>
							))}
						</ul>
					</span>
				</div>
			)}
		</>
	);
}

interface RowProps {
	item: CartItemView;
	operation?: CartItemOperation;
	issueMessage?: string;
	onQuantityChange: (quantity: number) => void;
	onRemove: () => void;
}

function OrderItemRow({
	item,
	operation,
	issueMessage,
	onQuantityChange,
	onRemove,
}: RowProps) {
	const { product, subtotal, subtotalWithoutDiscount, itemDiscount } = item;
	const image = product.images[0];
	const isBusy = operation !== undefined;

	// Короткая подсветка суммы строки после изменения количества. Считаем
	// именно смену значения, а не факт нажатия: сервер мог отклонить правку, и
	// подтверждать тогда нечего.
	const [changed, setChanged] = useState(false);
	const previousSubtotal = useRef(subtotal);
	useEffect(() => {
		if (previousSubtotal.current === subtotal) return;
		previousSubtotal.current = subtotal;
		setChanged(true);
		const timeout = setTimeout(() => setChanged(false), 640);
		return () => clearTimeout(timeout);
	}, [subtotal]);

	return (
		<li className={styles.item} data-busy={isBusy || undefined}>
			<Link
				href={getProductHref(product)}
				className={styles.itemFrame}
				tabIndex={-1}
				aria-hidden="true"
			>
				{image ? (
					<Image
						src={image.url}
						alt=""
						fill
						sizes="64px"
						className={styles.itemImage}
					/>
				) : (
					<ImageOff size={18} aria-hidden className={styles.itemImageEmpty} />
				)}
			</Link>

			<div className={styles.itemBody}>
				<div className={styles.itemHead}>
					{/* Кадр выше — копия этой же ссылки, поэтому он скрыт от
					    скринридера и выключен из обхода табом: одна позиция должна
					    давать одну остановку, а не две одинаковые. */}
					<Link href={getProductHref(product)} className={styles.itemName}>
						{product.title}
					</Link>

					<button
						type="button"
						className={styles.itemRemove}
						onClick={onRemove}
						disabled={isBusy}
						aria-label={`Убрать «${product.title}» из заказа`}
					>
						<X size={15} aria-hidden />
					</button>
				</div>

				<p className={styles.itemMeta}>
					<span>{formatPrice(item.unitFinalPrice)} / шт.</span>
					{itemDiscount > 0 && (
						<span className={styles.itemOld}>
							{formatPrice(item.unitPrice)}
						</span>
					)}
					{product.status === "preorder" && <span>Под заказ</span>}
					{issueMessage && (
						<span className={styles.itemMetaWarning}>{issueMessage}</span>
					)}
				</p>

				<div className={styles.itemFoot}>
					<CartQuantityStepper
						quantity={item.quantity}
						min={product.minOrderQuantity}
						max={product.maxOrderQuantity}
						disabled={isBusy}
						title={product.title}
						onChange={onQuantityChange}
						onRemove={onRemove}
					/>

					<p className={styles.itemMoney}>
						{itemDiscount > 0 && (
							<span className={styles.itemOld}>
								{formatPrice(subtotalWithoutDiscount)}
							</span>
						)}
						<span
							className={styles.itemTotal}
							data-changed={changed || undefined}
						>
							{formatPrice(subtotal)}
						</span>
					</p>
				</div>
			</div>
		</li>
	);
}
