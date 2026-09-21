"use client";

import { useEffect, useMemo, useState } from "react";
import type { BreadcrumbItem } from "@/components/Breadcrumbs/Breadcrumbs";
import { ProductGrid } from "@/modules/productCard/components/productGrid";
import catalog from "@/modules/productCatalog/components/Catalog.module.css";
import { PageContainer } from "@/shared/components/PageContainer";
import { appToast } from "@/shared/lib/toast";
import { useWishlistStore } from "@/shared/store/wishlist.store";
import { clearWishlistAction } from "../actions/wishlist.actions";
import { useGridChoreography } from "../hooks/useGridChoreography";
import { tailLabel } from "../lib/format";
import {
	DEFAULT_WISHLIST_SORT,
	sortWishlistItems,
	type WishlistSortValue,
} from "../lib/sort";
import type { WishlistView } from "../types";
import { ClearWishlistDialog } from "./ClearWishlistDialog";
import styles from "./Wishlist.module.css";
import { WishlistEmptyState } from "./WishlistEmptyState";
import { WishlistHero } from "./WishlistHero";
import { WishlistRail } from "./WishlistRail";

interface WishlistPageClientProps {
	initialWishlist: WishlistView;
	breadcrumbs: BreadcrumbItem[];
}

/**
 * Страница избранного.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ТРИ ЯРУСА
 * ────────────────────────────────────────────────────────────────────────────
 * Как в кабинете, заказах, отзывах и на витрине каталога, от общего к
 * частному:
 *
 *   1. первый экран — сколько отложено и сколько из этого есть в наличии;
 *   2. липкая панель — счётчик, порядок показа, очистка;
 *   3. сетка — сами товары, готовым компонентом productCard.
 *
 * Сетка и карточка НЕ переопределяются ни одним правилом: они уже сделаны, и
 * страница берёт их как есть. Всё оформление вокруг них — в Wishlist.module.css.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ГДЕ ЖИВЁТ СОСТОЯНИЕ
 * ────────────────────────────────────────────────────────────────────────────
 * Источник истины прежний и единственный — множество идентификаторов в сторе
 * избранного. Отдельного действия «убрать» на странице нет: сердечко на
 * карточке (то же самое, что в каталоге и на странице товара) обновляет стор,
 * а список здесь реактивно теряет позицию. Дублировать кнопку удаления рядом
 * с карточкой не нужно — она уже есть на самой карточке.
 *
 * Данные позиций приходят с сервера один раз и больше не меняются: стор
 * управляет только составом. Поэтому вернувшаяся позиция (сервер отказал, и
 * оптимистичное удаление откатилось) появляется обратно без перезагрузки.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЧТО ПРОИСХОДИТ ПРИ УДАЛЕНИИ
 * ────────────────────────────────────────────────────────────────────────────
 * Карточка гаснет на месте, соседи доезжают на новые места, счётчики в панели
 * и в первом экране пересчитываются, а когда уходит последняя позиция — сетка
 * сменяется пустым состоянием с тем же проявлением. Хореография вынесена в
 * useGridChoreography, потому что работает с уже отрисованными узлами и не
 * требует ни одной правки в карточке.
 *
 * Уведомление об удалении приходит от самого сердечка (useToggleWishlist) —
 * второго здесь нет намеренно: две всплывающие подсказки об одном действии
 * читаются как сбой.
 */
export function WishlistPageClient({
	initialWishlist,
	breadcrumbs,
}: WishlistPageClientProps) {
	const hydrate = useWishlistStore((s) => s.hydrate);
	const clear = useWishlistStore((s) => s.clear);
	const favoriteIds = useWishlistStore((s) => s.productIds);
	const storeReady = useWishlistStore((s) => s.hydrated);

	const [sort, setSort] = useState<WishlistSortValue>(DEFAULT_WISHLIST_SORT);
	const [clearOpen, setClearOpen] = useState(false);

	useEffect(() => {
		hydrate(initialWishlist.productIds);
	}, [initialWishlist, hydrate]);

	// Позиции, отложенные СЕЙЧАС, в выбранном порядке. Стор — фильтр, сервер —
	// источник самих данных.
	//
	// ДО ГИДРАТАЦИИ ФИЛЬТР НЕ ПРИМЕНЯЕТСЯ, и это не мелочь. Стор наполняется в
	// useEffect, то есть только в браузере; на сервере его множество пусто.
	// Пока фильтр стоял безусловно, серверная разметка страницы получалась
	// ПУСТОЙ — в HTML уезжало «в избранном пока пусто» вместе с нулями в первом
	// экране, и только после гидратации на их месте появлялись карточки. На
	// медленном соединении это подмигивание длиной в секунду, а без JavaScript
	// страница так и оставалась бы пустой.
	//
	// Расхождения разметки это не создаёт: первый клиентский рендер тоже идёт с
	// hydrated = false, то есть с тем же списком, что пришёл с сервера.
	const target = useMemo(() => {
		const visible = storeReady
			? initialWishlist.items.filter((item) => favoriteIds.has(item.product.id))
			: initialWishlist.items;
		return sortWishlistItems(visible, sort);
	}, [initialWishlist.items, favoriteIds, storeReady, sort]);

	const { gridRef, rendered } = useGridChoreography(target);

	// Счётчики считаются по ЦЕЛИ, а не по отрисованному списку: пока уходящая
	// карточка гаснет, она уже не отложена, и число обязано это показывать —
	// иначе отклик отстаёт от действия на треть секунды.
	const total = target.length;
	const available = useMemo(
		() => target.filter((item) => item.product.status === "available").length,
		[target],
	);

	async function handleClear() {
		const result = await clearWishlistAction();
		if (!result.success) {
			appToast.warning(result.message ?? "Не удалось очистить избранное");
			return;
		}
		clear();
		setClearOpen(false);
		appToast.success("Избранное очищено");
	}

	return (
		<>
			<WishlistHero
				breadcrumbs={breadcrumbs}
				total={total}
				available={available}
			/>

			<PageContainer className="pb-[4rem]">
				{/* Панель — прямой потомок колонки, без обёртки: её собственный
				    отступ задан в .rail, а обёртка ростом с панель отняла бы у
				    position: sticky ход (разбор — в Catalog.module.css). */}
				<div className="flex flex-col">
					{total > 0 && (
						<WishlistRail
							count={total}
							sort={sort}
							onSortChange={setSort}
							onClearRequest={() => setClearOpen(true)}
						/>
					)}

					<div
						className={
							total > 0
								? "mt-[2rem] sm:mt-[2.5rem]"
								: "mt-[clamp(2rem,4vw,3rem)]"
						}
					>
						{rendered.length > 0 ? (
							<>
								<div ref={gridRef}>
									<ProductGrid
										products={rendered.map((item) => item.product)}
									/>
								</div>

								{/* Конец списка отмечен так же, как в каталоге и заказах:
								    линия со служебной подписью. Без неё непонятно,
								    кончился список или не догрузился. */}
								<div className={styles.tail}>
									<span aria-hidden className={styles.tailRule} />
									<p className={catalog.micro}>{tailLabel(rendered.length)}</p>
									<span aria-hidden className={styles.tailRule} />
								</div>
							</>
						) : (
							<WishlistEmptyState />
						)}
					</div>
				</div>
			</PageContainer>

			<ClearWishlistDialog
				open={clearOpen}
				onClose={() => setClearOpen(false)}
				onConfirm={handleClear}
				count={total}
			/>
		</>
	);
}

export default WishlistPageClient;
