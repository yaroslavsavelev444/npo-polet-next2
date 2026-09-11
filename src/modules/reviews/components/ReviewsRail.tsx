"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import catalog from "@/modules/productCatalog/components/Catalog.module.css";
import {
	type SegmentedTabItem,
	SegmentedTabs,
} from "@/shared/components/segmented/SegmentedTabs";

interface ReviewsRailProps<K extends string> {
	/** Имя параметра адреса, которым управляет панель: rating или status. */
	paramName: string;
	/** Значение, которое НЕ пишется в адрес (состояние по умолчанию). */
	allKey: K;
	value: K;
	items: SegmentedTabItem<K>[];
	label: string;
	/** Сколько отзывов в текущей выдаче. */
	totalDocs: number;
	countLabel: string;
}

/**
 * Панель отбора отзывов.
 *
 * Та же липкая .rail, что держит выдачу каталога, разделы кабинета и список
 * заказов: класс тот же самый, поэтому страницы не могут разъехаться ни по
 * росту, ни по материалу, ни по поведению при прокрутке. На ленте в несколько
 * экранов это не украшение — сменить отбор из её конца, не прокручивая
 * обратно наверх, иначе нельзя.
 *
 * Отбор СЕРВЕРНЫЙ (router.push): отзывов в каталоге бывают сотни, они
 * приходят страницами, и фильтровать их на клиенте означало бы сначала
 * выгрузить все. Тем же путём идёт отбор заказов; от витрины каталога, где
 * разделов два десятка и отбор идёт в памяти браузера, это отличается
 * осознанно.
 *
 * Один компонент на обе страницы: различаются только имя параметра и набор
 * позиций. Два почти одинаковых компонента разошлись бы на первой правке.
 */
export function ReviewsRail<K extends string>({
	paramName,
	allKey,
	value,
	items,
	label,
	totalDocs,
	countLabel,
}: ReviewsRailProps<K>) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const [isPending, startTransition] = useTransition();

	function handleSelect(next: K) {
		const params = new URLSearchParams(searchParams.toString());
		if (next === allKey) params.delete(paramName);
		else params.set(paramName, next);

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
					<span className={catalog.micro}>{countLabel}</span>
				</p>

				<span className={catalog.railDivider} aria-hidden />

				<SegmentedTabs
					items={items}
					value={value}
					onChange={handleSelect}
					label={label}
					pending={isPending}
				/>
			</div>
		</div>
	);
}

export default ReviewsRail;
