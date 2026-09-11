"use client";

import debounce from "lodash/debounce";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { parseCategorySearchParams } from "../lib/parseFilters";
import type {
	CategoryFilters,
	CategorySortField,
	CategorySortOrder,
} from "../types/filters";

/**
 * Состояние витрины разделов: строка поиска и порядок сортировки.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ СОСТОЯНИЕ ЗДЕСЬ, А НЕ В URL
 * ────────────────────────────────────────────────────────────────────────────
 * Раньше каждое нажатие клавиши уходило в router.replace: сервер заново
 * собирал страницу, отбирал разделы и присылал разметку. То есть на отбор
 * двух десятков записей, уже лежащих в памяти браузера, тратился сетевой
 * обход — на мобильной сети это 200-500 мс задержки между буквой и
 * результатом, и список «догонял» ввод.
 *
 * Теперь истина — это состояние компонента, а отбор идёт локально
 * (applyCategoryFilters, та же функция, что и на сервере). Ввод мгновенный,
 * сеть не участвует вовсе.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * URL ПРИ ЭТОМ НЕ ТЕРЯЕТСЯ
 * ────────────────────────────────────────────────────────────────────────────
 * Адрес по-прежнему отражает выдачу — ссылку на «каталог с фильтром» можно
 * отправить, а при её открытии отбор сделает сервер (первая отрисовка, она же
 * попадает в HTML для поисковика и для выключенного JS).
 *
 * Пишется адрес через window.history.replaceState, а не router.replace: он
 * интегрирован с роутером Next (см. node_modules/next/dist/docs → app/guides/
 * single-page-applications, «Shallow routing on the client») и обновляет
 * строку браузера БЕЗ обращения к серверу — ровно то, ради чего отбор и
 * переехал на клиент. replace, а не push: двадцать записей истории на
 * набранное слово превратили бы кнопку «назад» в посимвольную отмену ввода.
 *
 * Запись отложена на 320 мс: адрес нужен уходящему по ссылке, а не
 * печатающему, и переписывать его на каждую букву незачем.
 */

/** Значение сортировки по умолчанию — порядок, заданный в админке. */
const DEFAULT_SORT: Pick<CategoryFilters, "field" | "order"> = {
	field: "order",
	order: "asc",
};

function isDefaultSort(field: CategorySortField, order: CategorySortOrder) {
	return field === DEFAULT_SORT.field && order === DEFAULT_SORT.order;
}

function buildQueryString(filters: CategoryFilters): string {
	const params = new URLSearchParams();
	const q = filters.q?.trim();
	if (q) params.set("q", q);
	// Значения по умолчанию в адрес не пишутся: /category и
	// /category?sort=order&order=asc — одна и та же страница, и вторая форма
	// плодит дубли для поисковика.
	if (!isDefaultSort(filters.field, filters.order)) {
		params.set("sort", filters.field);
		params.set("order", filters.order);
	}
	return params.toString();
}

export function useCategoryFilters(initial: CategoryFilters) {
	const pathname = usePathname();

	// Поле ввода и отбор разведены намеренно: в поле лежит ровно то, что
	// набрали, а отбор идёт по подтверждённому значению. Пока они совпадают,
	// разница незаметна — она понадобится, если отбор придётся притормозить
	// на очень длинном списке.
	const [query, setQuery] = useState(initial.q ?? "");
	const [sort, setSort] = useState<Pick<CategoryFilters, "field" | "order">>({
		field: initial.field,
		order: initial.order,
	});

	const filters = useMemo<CategoryFilters>(
		() => ({ q: query.trim() || undefined, ...sort }),
		[query, sort],
	);

	const syncUrl = useCallback(
		(next: CategoryFilters) => {
			const search = buildQueryString(next);
			window.history.replaceState(
				null,
				"",
				search ? `${pathname}?${search}` : pathname,
			);
		},
		[pathname],
	);

	const syncUrlDebounced = useMemo(() => debounce(syncUrl, 320), [syncUrl]);

	useEffect(() => () => syncUrlDebounced.cancel(), [syncUrlDebounced]);

	const updateQuery = useCallback(
		(value: string) => {
			setQuery(value);
			syncUrlDebounced({ q: value.trim() || undefined, ...sort });
		},
		[sort, syncUrlDebounced],
	);

	const clearQuery = useCallback(() => {
		syncUrlDebounced.cancel();
		setQuery("");
		syncUrl({ q: undefined, ...sort });
	}, [sort, syncUrl, syncUrlDebounced]);

	const updateSort = useCallback(
		(field: CategorySortField, order: CategorySortOrder) => {
			// Смена порядка — одиночное действие, а не поток: адрес обновляется
			// сразу, отложенная запись поиска при этом не должна перезаписать его
			// старым значением сортировки.
			syncUrlDebounced.cancel();
			setSort({ field, order });
			syncUrl({ q: query.trim() || undefined, field, order });
		},
		[query, syncUrl, syncUrlDebounced],
	);

	const resetFilters = useCallback(() => {
		syncUrlDebounced.cancel();
		setQuery("");
		setSort(DEFAULT_SORT);
		syncUrl(DEFAULT_SORT);
	}, [syncUrl, syncUrlDebounced]);

	// Кнопки «назад»/«вперёд» браузера. replaceState записей в историю не
	// добавляет, но переход на страницу раздела и возврат — добавляет, и после
	// него адрес может отличаться от состояния компонента. Источник истины при
	// таком переходе один — сам адрес.
	useEffect(() => {
		const adopt = () => {
			const parsed = parseCategorySearchParams(
				Object.fromEntries(new URLSearchParams(window.location.search)),
			);
			syncUrlDebounced.cancel();
			setQuery(parsed.q ?? "");
			setSort({ field: parsed.field, order: parsed.order });
		};

		window.addEventListener("popstate", adopt);
		return () => window.removeEventListener("popstate", adopt);
	}, [syncUrlDebounced]);

	const hasQuery = filters.q !== undefined;
	const hasSort = !isDefaultSort(sort.field, sort.order);

	return {
		/** Значение поля ввода — управляемое, показывается как есть. */
		query,
		filters,
		sort,
		updateQuery,
		clearQuery,
		updateSort,
		resetFilters,
		/* Сортировка считается наравне с поиском: «Сбросить» обязан вернуть
		   витрину в исходное состояние целиком, а не наполовину. */
		activeFiltersCount: (hasQuery ? 1 : 0) + (hasSort ? 1 : 0),
	};
}
