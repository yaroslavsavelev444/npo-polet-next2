"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import catalog from "@/modules/productCatalog/components/Catalog.module.css";
import {
	type SegmentedTabItem,
	SegmentedTabs,
} from "@/shared/components/segmented/SegmentedTabs";
import { ORDER_FILTER_GROUPS } from "../lib/status.groups";
import type { OrderFilterGroup } from "../types";

interface OrdersRailProps {
	active: OrderFilterGroup;
	/** Сколько заказов в каждой вкладке — счётчик прямо на сегменте. */
	counts: Record<OrderFilterGroup, number>;
	/** Сколько заказов в текущей выдаче (с учётом постраничной навигации). */
	totalDocs: number;
}

function pluralOrders(count: number): string {
	const mod10 = count % 10;
	const mod100 = count % 100;
	if (mod10 === 1 && mod100 !== 11) return "заказ";
	if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20))
		return "заказа";
	return "заказов";
}

/**
 * Панель управления списком заказов.
 *
 * Та же липкая .rail, что держит выдачу каталога и разделы кабинета: класс тот
 * же самый, поэтому страницы не могут разъехаться ни по росту, ни по
 * материалу, ни по поведению при прокрутке. На списке в несколько экранов это
 * не украшение — переключиться на «Текущие» из конца списка, не прокручивая
 * обратно наверх, иначе нельзя.
 *
 * Отбор остаётся СЕРВЕРНЫМ (router.push): заказов у покупателя бывают сотни,
 * они приходят страницами по десять, и отбирать их на клиенте означало бы
 * сначала выгрузить все. Этим страница отличается от витрины каталога, где
 * разделов два десятка и отбор идёт в памяти браузера.
 *
 * Пока ответ не пришёл, ряд помечен занятым и приглушён, но остаётся рабочим:
 * запретить нажатия значило бы заставить ждать того, кто просто передумал.
 *
 * У каждого сегмента счётчик: видно, где заказы есть, ещё до переключения —
 * и не нужно заходить в пустую вкладку, чтобы это выяснить.
 */
export function OrdersRail({ active, counts, totalDocs }: OrdersRailProps) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const [isPending, startTransition] = useTransition();

	const items: SegmentedTabItem<OrderFilterGroup>[] = ORDER_FILTER_GROUPS.map(
		(group) => ({
			key: group.key,
			label: group.label,
			count: counts[group.key],
		}),
	);

	function handleSelect(group: OrderFilterGroup) {
		const params = new URLSearchParams(searchParams.toString());
		if (group === "all") params.delete("status");
		else params.set("status", group);
		// Смена отбора возвращает на первую страницу: «страница 3» другого
		// отбора — это чужая страница, и чаще всего её просто не существует.
		params.delete("page");

		const query = params.toString();
		startTransition(() => {
			router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
		});
	}

	return (
		<div className={catalog.rail}>
			<div className={catalog.railRow}>
				<p className={catalog.summary} role="status">
					<span className={catalog.summaryValue}>{totalDocs}</span>
					<span className={catalog.micro}>{pluralOrders(totalDocs)}</span>
				</p>

				<span className={catalog.railDivider} aria-hidden />

				<SegmentedTabs
					items={items}
					value={active}
					onChange={handleSelect}
					label="Отбор заказов по состоянию"
					pending={isPending}
				/>
			</div>
		</div>
	);
}

export default OrdersRail;
