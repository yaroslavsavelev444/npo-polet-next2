"use client";

import { useEffect, useRef, useState } from "react";
import type { AnalyticsSection } from "../lib/constants";
import type {
	AnalyticsResponse,
	CustomersDTO,
	FunnelDTO,
	GeoDTO,
	MetaDTO,
	OverviewDTO,
	ProductsDTO,
	ProductTableDTO,
} from "../lib/types";

export type SectionData = {
	meta: MetaDTO;
	overview: OverviewDTO;
	products: ProductsDTO;
	product_table: ProductTableDTO;
	geo: GeoDTO;
	customers: CustomersDTO;
	funnel: FunnelDTO;
};

/** Сколько живёт ответ при переключении вкладок: цифры не должны устаревать. */
const CACHE_TTL_MS = 60_000;
const CACHE_LIMIT = 40;

const cache = new Map<string, { at: number; data: AnalyticsResponse }>();

function remember(url: string, data: AnalyticsResponse) {
	if (cache.size >= CACHE_LIMIT) {
		const oldest = cache.keys().next().value;
		if (oldest) cache.delete(oldest);
	}
	cache.set(url, { at: Date.now(), data });
}

export function clearAnalyticsCache() {
	cache.clear();
}

export function useAnalyticsData<S extends AnalyticsSection>(
	section: S,
	params: string,
	reloadKey = 0,
) {
	const [data, setData] = useState<SectionData[S] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const lastUrl = useRef<string | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey — явный запрос обновить данные
	useEffect(() => {
		const url = `/api/orders/analytics?section=${section}${params ? `&${params}` : ""}`;
		lastUrl.current = url;

		const cached = cache.get(url);
		if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
			setData(cached.data as SectionData[S]);
			setError(null);
			setLoading(false);
			return;
		}

		const controller = new AbortController();
		// Предыдущий отчёт остаётся на экране приглушённым до прихода нового.
		setLoading(true);
		setError(null);
		fetch(url, {
			credentials: "same-origin",
			cache: "no-store",
			signal: controller.signal,
		})
			.then(async (response) => {
				if (response.status === 401) {
					window.location.assign(
						`/admin/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`,
					);
					return;
				}
				const body = (await response.json().catch(() => null)) as
					| AnalyticsResponse
					| { errors?: { message?: string }[] }
					| null;
				if (!response.ok) {
					const message =
						(body as { errors?: { message?: string }[] } | null)?.errors?.[0]
							?.message ?? `Ошибка ${response.status}`;
					throw new Error(message);
				}
				remember(url, body as AnalyticsResponse);
				setData(body as SectionData[S]);
				setLoading(false);
			})
			.catch((reason: Error) => {
				if (controller.signal.aborted) return;
				setError(reason.message || "Не удалось загрузить данные");
				setLoading(false);
			});
		return () => controller.abort();
	}, [section, params, reloadKey]);

	return { data, error, loading };
}
