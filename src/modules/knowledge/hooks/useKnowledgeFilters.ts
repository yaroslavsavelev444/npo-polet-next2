"use client";

import debounce from "lodash/debounce";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useTransition } from "react";

export interface KnowledgeUrlFilters {
	q: string;
	category: string | null;
	section: string | null;
	page: number;
}

/**
 * Состояние поиска и фильтров базы знаний живёт в URL.
 *
 * Почему не в React-состоянии: адрес с запросом и фильтрами можно отправить
 * коллеге, сохранить в закладки и вернуться назад кнопкой браузера — всё это
 * пропадает, как только состояние переезжает в компонент. Кроме того,
 * результаты при таком раскладе рендерит сервер, и на клиент не уезжает ни
 * корпус статей, ни слой запросов к нему.
 *
 * router.replace, а не push: набор текста не должен превращать историю
 * браузера в посимвольную ленту, из которой не выбраться кнопкой «назад».
 * Переключение фильтров — тоже replace, по той же причине.
 *
 * Тот же приём уже используется в фильтрах каталога (useCategoryFilters) —
 * это осознанное повторение одного паттерна, а не расхождение архитектур.
 */
export function useKnowledgeFilters() {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	// isPending живёт, пока сервер не отдал новый рендер списка, — на нём и
	// строится индикатор загрузки: своего состояния «идёт запрос» у нас нет,
	// потому что запросов с клиента тоже нет.
	const [isPending, startTransition] = useTransition();

	const filters: KnowledgeUrlFilters = useMemo(
		() => ({
			q: searchParams.get("q") ?? "",
			category: searchParams.get("category"),
			section: searchParams.get("section"),
			page: Number(searchParams.get("page")) || 1,
		}),
		[searchParams],
	);

	const updateURL = useCallback(
		(next: Record<string, string | null>) => {
			const params = new URLSearchParams(searchParams.toString());

			for (const [key, value] of Object.entries(next)) {
				if (value === null || value === "") params.delete(key);
				else params.set(key, value);
			}

			// Любое изменение запроса или фильтра начинает выдачу заново:
			// оставшийся ?page=7 показал бы пустую страницу нового набора.
			if (!("page" in next)) params.delete("page");

			const query = params.toString();
			startTransition(() => {
				router.replace(query ? `${pathname}?${query}` : pathname, {
					scroll: false,
				});
			});
		},
		[searchParams, pathname, router],
	);

	const updateSearch = useCallback(
		(value: string) => updateURL({ q: value.trim() || null }),
		[updateURL],
	);

	// 300 мс — компромисс: меньше превращает каждую букву в серверный рендер,
	// больше уже ощущается как задержка.
	const debouncedSearch = useMemo(
		() => debounce(updateSearch, 300),
		[updateSearch],
	);

	useEffect(() => () => debouncedSearch.cancel(), [debouncedSearch]);

	const clearSearch = useCallback(() => {
		debouncedSearch.cancel();
		updateSearch("");
	}, [debouncedSearch, updateSearch]);

	const setCategory = useCallback(
		(slug: string | null) =>
			// Секция принадлежит разделу: при смене раздела прежняя секция
			// перестаёт существовать в новом контексте и должна уйти вместе с ним.
			updateURL({ category: slug, section: null }),
		[updateURL],
	);

	const setSection = useCallback(
		(slug: string | null) => updateURL({ section: slug }),
		[updateURL],
	);

	const reset = useCallback(() => {
		debouncedSearch.cancel();
		updateURL({ q: null, category: null, section: null });
	}, [debouncedSearch, updateURL]);

	const activeCount =
		(filters.q ? 1 : 0) +
		(filters.category ? 1 : 0) +
		(filters.section ? 1 : 0);

	return {
		filters,
		isPending,
		debouncedSearch,
		updateSearch,
		clearSearch,
		setCategory,
		setSection,
		reset,
		activeCount,
	};
}
