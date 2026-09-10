"use client";

import { ArrowRight, ImageOff, PackageOpen } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ProductCardData } from "@/modules/productCard";
import {
	calculatePriceBreakdown,
	formatPrice,
	getProductHref,
} from "@/modules/productCard";
import { getCartRecommendationsAction } from "../actions/cart.actions";
import styles from "./Cart.module.css";

interface Props {
	/** Категории из шапки — те же, что в мобильном меню. */
	categories: { id: string; name: string; slug: string }[];
	onNavigate: () => void;
}

const MAX_CHIPS = 5;

/**
 * Пустая корзина.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЭТО НЕ СООБЩЕНИЕ ОБ ОШИБКЕ
 * ────────────────────────────────────────────────────────────────────────────
 * Прежнее состояние — серый круг с иконкой и фраза «Ваша корзина пуста» —
 * сообщало ровно то, что и так видно по пустому списку, и не предлагало
 * ничего. Здесь пустая корзина работает как развилка: один заметный путь
 * (каталог), несколько коротких (категории) и несколько конкретных
 * (товары, которые заказывают чаще всего).
 *
 * Рекомендации загружаются ТОЛЬКО когда пустую панель действительно открыли.
 * Отдельного механизма подбора в проекте нет — берётся тот же список, что и
 * на главной (showOnMainPage), — и заводить второй ради корзины значило бы
 * завести вторую редакционную политику там, где уже есть одна.
 *
 * Пока список едет, на его месте НИЧЕГО не показывается — ни скелета, ни
 * заголовка. Блок появляется целиком и только если товары действительно
 * нашлись: заголовок «Часто заказывают» над пустотой хуже, чем его отсутствие.
 */
export function CartEmpty({ categories, onNavigate }: Props) {
	const [suggestions, setSuggestions] = useState<ProductCardData[]>([]);

	useEffect(() => {
		let cancelled = false;
		void getCartRecommendationsAction()
			.then((products) => {
				if (!cancelled) setSuggestions(products);
			})
			// Рекомендации — приятное дополнение. Если они не пришли, пустая
			// корзина обязана остаться рабочей, а не показать ошибку.
			.catch(() => undefined);
		return () => {
			cancelled = true;
		};
	}, []);

	const chips = categories.slice(0, MAX_CHIPS);

	return (
		<div className={styles.empty}>
			<div className={styles.emptyMark} aria-hidden="true">
				<span className={styles.emptyMarkIcon}>
					<PackageOpen size={28} aria-hidden />
				</span>
			</div>

			<h3 className={styles.emptyTitle}>Пока пусто</h3>
			<p className={styles.emptyText}>
				Выбранные товары появятся в этой панели — её можно открыть с любой
				страницы, не теряя того, что смотрите.
			</p>

			<div className={styles.emptyActions}>
				<Link
					href="/category"
					className={styles.emptyPrimary}
					onClick={onNavigate}
				>
					Открыть каталог
					<ArrowRight size={16} aria-hidden />
				</Link>
			</div>

			{chips.length > 0 && (
				<section
					aria-labelledby="cart-empty-categories"
					style={{ width: "100%" }}
				>
					<h4 className={styles.sectionLabel} id="cart-empty-categories">
						Категории
					</h4>
					<div className={styles.chips}>
						{chips.map((category) => (
							<Link
								key={category.id}
								href={`/category/${category.slug}`}
								className={styles.chip}
								title={category.name}
								onClick={onNavigate}
							>
								{category.name}
							</Link>
						))}
					</div>
				</section>
			)}

			{suggestions.length > 0 && (
				<section
					aria-labelledby="cart-empty-suggestions"
					style={{ width: "100%", marginTop: "1.75rem" }}
				>
					<h4 className={styles.sectionLabel} id="cart-empty-suggestions">
						Часто заказывают
					</h4>
					{suggestions.map((product) => (
						<SuggestionRow
							key={product.id}
							product={product}
							onNavigate={onNavigate}
						/>
					))}
				</section>
			)}
		</div>
	);
}

function SuggestionRow({
	product,
	onNavigate,
}: {
	product: ProductCardData;
	onNavigate: () => void;
}) {
	const image = product.images[0];
	const { finalPrice } = calculatePriceBreakdown(
		product.priceForIndividual,
		product.discount,
	);

	return (
		<Link
			href={getProductHref(product)}
			className={styles.suggestion}
			onClick={onNavigate}
		>
			<span className={styles.thumb} style={{ borderRadius: "6px" }}>
				{image ? (
					<Image
						src={image.url}
						alt=""
						fill
						sizes="48px"
						className={styles.thumbImage}
					/>
				) : (
					<span className={styles.thumbEmpty}>
						<ImageOff size={14} aria-hidden />
					</span>
				)}
			</span>
			<span className={styles.suggestionTitle}>{product.title}</span>
			<span className={styles.suggestionPrice}>{formatPrice(finalPrice)}</span>
		</Link>
	);
}
