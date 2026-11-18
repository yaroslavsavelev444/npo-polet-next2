"use client";

import { useCallback, useEffect, useState } from "react";
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

interface ReportSnapshot<S extends AnalyticsSection> {
	data: SectionData[S];
	params: URLSearchParams;
}

interface ReportState<S extends AnalyticsSection> {
	snapshot: ReportSnapshot<S> | null;
	completed: { key: string; error: string | null } | null;
}

export function useAnalyticsData<S extends AnalyticsSection>(
	section: S,
	params: string,
	reloadKey = 0,
) {
	const url = `/api/orders/analytics?section=${section}${params ? `&${params}` : ""}`;
	const [retryKey, setRetryKey] = useState(0);
	const requestKey = `${reloadKey}:${retryKey}:${url}`;
	const [state, setState] = useState<ReportState<S>>({
		snapshot: null,
		completed: null,
	});

	const retry = useCallback(() => {
		cache.delete(url);
		setRetryKey((key) => key + 1);
	}, [url]);

	useEffect(() => {
		const finish = (data: SectionData[S]) => {
			setState({
				snapshot: { data, params: new URLSearchParams(params) },
				completed: { key: requestKey, error: null },
			});
		};

		const cached = cache.get(url);
		if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
			finish(cached.data as SectionData[S]);
			return;
		}

		const controller = new AbortController();
		fetch(url, {
			credentials: "same-origin",
			cache: "no-store",
			signal: controller.signal,
		})
			.then(async (response) => {
				if (controller.signal.aborted) return;
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
				if (controller.signal.aborted) return;
				if (!response.ok) {
					const message =
						(body as { errors?: { message?: string }[] } | null)?.errors?.[0]
							?.message ?? `Ошибка ${response.status}`;
					throw new Error(message);
				}
				if (
					!body ||
					typeof body !== "object" ||
					!("section" in body) ||
					body.section !== section
				) {
					throw new Error("Не удалось прочитать отчёт");
				}
				remember(url, body);
				finish(body as SectionData[S]);
			})
			.catch((reason: Error) => {
				if (controller.signal.aborted) return;
				setState((current) => ({
					...current,
					completed: {
						key: requestKey,
						error: reason.message || "Не удалось загрузить данные",
					},
				}));
			});
		return () => controller.abort();
	}, [params, requestKey, section, url]);

	const loading = state.completed?.key !== requestKey;
	return {
		data: state.snapshot?.data ?? null,
		shownParams: state.snapshot?.params ?? null,
		error: loading ? null : (state.completed?.error ?? null),
		loading,
		retry,
	};
}
