import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/getCurrentUser";
import { checkRateLimit } from "@/modules/auth/lib/rateLimit";
import {
	isCompanyQuerySearchable,
	normalizeCompanyQuery,
} from "@/modules/checkout/lib/company-query";
import {
	fetchCompanySuggestions,
	isDadataConfigured,
	toDegradeReason,
} from "@/modules/checkout/server/dadata-client";
import { SuggestionCache } from "@/modules/checkout/server/suggestion-cache";
import type {
	CompanySuggestion,
	CompanySuggestResponse,
} from "@/modules/checkout/types";

// Читаем сессию Payload — нужен Node.js runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Прокси подсказок организаций DaData (suggest/party) для блока «Плательщик».
 *
 * Устроен так же, как /api/address/suggest, и по тем же причинам: ключ не
 * покидает сервер, запросы доступны только вошедшим покупателям, перед
 * квотой стоят лимит частоты и кэш.
 *
 *   POST { query: string }  — ИНН, ОГРН или часть названия
 *   200  { suggestions: CompanySuggestion[], degraded?: CompanySuggestDegradeReason }
 *
 * `degraded` — «подсказки сейчас недоступны, заполните реквизиты вручную».
 * Поля реквизитов в форме видны всегда, поэтому для покупателя это не
 * ошибка, а отсутствие ускорения.
 */

/** Столько вариантов помещается в список без прокрутки. */
const SUGGESTION_COUNT = 7;

/**
 * Организации ищут реже адресов и обычно одним запросом (ИНН целиком),
 * поэтому лимит ниже адресного: 40 запросов в минуту с запасом покрывают
 * набор названия, но не дают одному аккаунту выбрать дневную квоту.
 */
const RATE_LIMIT = 40;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

// ── Кэш ────────────────────────────────────────────────────────────────────
// Тот же LRU+TTL, что у адресов (server/suggestion-cache.ts), своим
// экземпляром: у подсказок другой тип значения и другой срок годности.
// ЕГРЮЛ в DaData обновляется раз в сутки, так что час — компромисс между
// квотой (повторный поиск той же организации, возврат на страницу) и
// свежестью: смена руководителя или адреса доедет до формы в пределах часа
// после обновления справочника. Кэшируются только успешные ответы — отказ
// провайдера не должен «залипать» на весь TTL.
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 300;

const cache = new SuggestionCache<CompanySuggestion[]>(
	CACHE_MAX_ENTRIES,
	CACHE_TTL_MS,
);

function ok(
	body: CompanySuggestResponse,
): NextResponse<CompanySuggestResponse> {
	return NextResponse.json(body, {
		// Ответ доступен только вошедшим — промежуточные кэши не должны его
		// сохранять.
		headers: { "Cache-Control": "no-store" },
	});
}

export async function POST(
	request: NextRequest,
): Promise<NextResponse<CompanySuggestResponse | { error: string }>> {
	const user = await getCurrentUser();
	if (!user) {
		return NextResponse.json(
			{ error: "Требуется авторизация" },
			{ status: 401 },
		);
	}

	let body: { query?: unknown };
	try {
		body = (await request.json()) as { query?: unknown };
	} catch {
		return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
	}

	const query = normalizeCompanyQuery(
		typeof body.query === "string" ? body.query : "",
	);

	if (!isCompanyQuerySearchable(query)) {
		return ok({ suggestions: [], degraded: "too_short" });
	}

	if (!isDadataConfigured()) {
		return ok({ suggestions: [], degraded: "not_configured" });
	}

	// Регистр в названиях не значим («ромашка» = «РОМАШКА»), а нормализация
	// пробелов уже сделана — ключ совпадает для всех вариантов набора.
	const cacheKey = query.toLowerCase();
	const cached = cache.get(cacheKey);
	if (cached) return ok({ suggestions: cached });

	// Лимит по пользователю, а не по IP (за одним IP сидит весь отдел).
	// Fail-open — подсказки вспомогательные, падение Redis не должно их гасить.
	const limit = await checkRateLimit(
		`company_suggest:${user.id}`,
		RATE_LIMIT,
		RATE_LIMIT_WINDOW_MS,
	);
	if (!limit.allowed) {
		return ok({ suggestions: [], degraded: "rate_limited" });
	}

	const result = await fetchCompanySuggestions({
		query,
		count: SUGGESTION_COUNT,
	});

	if (!result.ok) {
		return ok({ suggestions: [], degraded: toDegradeReason(result.reason) });
	}

	cache.set(cacheKey, result.suggestions);
	return ok({ suggestions: result.suggestions });
}
