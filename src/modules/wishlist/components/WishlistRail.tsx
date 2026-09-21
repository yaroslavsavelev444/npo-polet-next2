"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import catalog from "@/modules/productCatalog/components/Catalog.module.css";
import { pluralizeProducts } from "../lib/format";
import type { WishlistSortValue } from "../lib/sort";
import styles from "./Wishlist.module.css";
import { WishlistSortMenu } from "./WishlistSortMenu";

interface WishlistRailProps {
	/** Сколько позиций показано сейчас. Меняется прямо под курсором. */
	count: number;
	sort: WishlistSortValue;
	onSortChange: (value: WishlistSortValue) => void;
	onClearRequest: () => void;
}

/**
 * Управление избранным.
 *
 * Та же липкая .rail, что держит выдачу каталога, разделы кабинета, список
 * заказов и ленту отзывов: класс берётся из Catalog.module.css напрямую,
 * поэтому страницы не могут разъехаться ни по росту, ни по материалу, ни по
 * поведению при прокрутке.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЧТО ЗДЕСЬ ЕСТЬ И ЧЕГО НЕТ
 * ────────────────────────────────────────────────────────────────────────────
 * Счётчик, порядок показа, очистка — и ничего больше. Фильтров нет намеренно:
 * отложенных позиций обычно единицы, и вкладки над сеткой из шести карточек
 * превратили бы личный раздел в урезанный каталог (разбор — в lib/sort.ts).
 *
 * Сортировка появляется только начиная с двух позиций: над единственной
 * карточкой это орган управления, которому нечем управлять.
 *
 * Очистка стоит у правого края, отдельно от сортировки: это единственное
 * действие панели, которое что-то ЛОМАЕТ, и соседство с безобидным
 * переключателем порядка сделало бы промах слишком дешёвым. Само нажатие
 * ничего не стирает — открывается подтверждение.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * СЧЁТЧИК
 * ────────────────────────────────────────────────────────────────────────────
 * Он живой, и это единственное число на странице, меняющееся в ответ на
 * действие. role="status" сообщает новое значение скринридеру, а короткий
 * подъём — глазу: без отклика непонятно, засчиталось ли нажатие сердечка на
 * карточке, которая уже уехала из поля зрения.
 */
export function WishlistRail({
	count,
	sort,
	onSortChange,
	onClearRequest,
}: WishlistRailProps) {
	// Отклик счётчика должен срабатывать на ИЗМЕНЕНИЕ, а не на каждую
	// отрисовку, поэтому предыдущее значение хранится в ref, а ключ анимации
	// растёт только когда число действительно стало другим.
	const previous = useRef(count);
	const [tick, setTick] = useState(0);

	useEffect(() => {
		if (previous.current === count) return;
		previous.current = count;
		setTick((value) => value + 1);
	}, [count]);

	return (
		<div className={catalog.rail}>
			<div className={catalog.railRow}>
				<p className={catalog.summary} role="status">
					<span
						key={tick}
						className={`${catalog.summaryValue} ${styles.count} ${
							tick > 0 ? styles.countTick : ""
						}`}
					>
						{count}
					</span>
					<span className={catalog.micro}>{pluralizeProducts(count)}</span>
				</p>

				<span className={catalog.railSpacer} />

				{count > 1 && (
					<div className={styles.sortSlot}>
						<WishlistSortMenu value={sort} onChange={onSortChange} />
					</div>
				)}

				<span className={catalog.railDivider} aria-hidden />

				<button
					type="button"
					onClick={onClearRequest}
					className={styles.clear}
					aria-label="Очистить избранное"
				>
					<Trash2 size={14} aria-hidden />
					<span className={styles.clearLabel}>Очистить</span>
				</button>
			</div>
		</div>
	);
}

export default WishlistRail;
