import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/getCurrentUser";
import { checkRateLimit } from "@/modules/auth/lib/rateLimit";
import {
	fetchAddressSuggestions,
	isDadataConfigured,
	MAX_QUERY_LENGTH,
} from "@/modules/checkout/server/dadata-client";
import { SuggestionCache } from "@/modules/checkout/server/suggestion-cache";
import type {
	AddressSuggestDegradeReason,
	AddressSuggestion,
	AddressSuggestResponse,
} from "@/modules/checkout/types";

// Читаем сессию Payload — нужен Node.js runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Прокси подсказок адресов DaData.
 *
 * Ключ DaData не покидает сервер (см. server/dadata-client.ts), а этот роут
 * добавляет к нему три вещи, которых у прямого обращения из браузера быть не
 * может: проверку сессии, ограничение частоты и кэш.
 *
 * Формат ответа стабилен и не зависит от провайдера подсказок:
 *   200 { suggestions: AddressSuggestion[], degraded?: AddressSuggestDegradeReason }
 * `degraded` означает «подсказки сейчас недоступны, предложите ручной ввод».
 * Отдельным HTTP-кодом это не оформляется намеренно: для формы недоступность
 * подсказок — не ошибка запроса, а режим работы, и клиенту проще обработать
 * один успешный ответ, чем ветвиться по кодам.
 */

/** Ниже трёх символов подсказки шумные, а квота тратится зря. */
const MIN_QUERY_LENGTH = 3;
const DEFAULT_COUNT = 8;
const MAX_COUNT = 10;

/** Максимум подсказок в минуту на пользователя. */
const RATE_LIMIT = 90;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

// ── Кэш ────────────────────────────────────────────────────────────────────
// Один и тот же префикс запроса набирают десятки пользователей («москва»,
// «санкт-петербург»), а дневная квота DaData общая на аккаунт. Реализация —
// в server/suggestion-cache.ts (LRU + TTL), чтобы её поведение проверялось
// тестом отдельно от роута.
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;

const cache = new SuggestionCache<AddressSuggestion[]>(
	CACHE_MAX_ENTRIES,
	CACHE_TTL_MS,
);

interface SuggestRequestBody {
	query?: unknown;
	count?: unknown;
	/** `city` — подсказки только по городам (для ПВЗ), иначе полный адрес. */
	toBound?: unknown;
}

function ok(
	body: AddressSuggestResponse,
): NextResponse<AddressSuggestResponse> {
	return NextResponse.json(body, {
		// Ответ зависит от сессии пользователя — промежуточные кэши не должны
		// его сохранять.
		headers: { "Cache-Control": "no-store" },
	});
}

function mapFailureReason(
	reason:
		| "not_configured"
		| "unauthorized"
		| "rate_limited"
		| "timeout"
		| "upstream_error",
): AddressSuggestDegradeReason {
	if (reason === "not_configured") return "not_configured";
	if (reason === "rate_limited") return "rate_limited";
	// unauthorized у DaData означает и неверный ключ, и исчерпанную квоту:
	// пользователю в обоих случаях нужен ручной ввод, а не разные тексты.
	return "unavailable";
}

export async function POST(
	request: NextRequest,
): Promise<NextResponse<AddressSuggestResponse | { error: string }>> {
	// Подсказки нужны только на оформлении заказа, а оно доступно лишь
	// авторизованным. Проверка сессии превращает дневную квоту DaData из
	// общедоступного ресурса в ресурс наших покупателей.
	const user = await getCurrentUser();
	if (!user) {
		return NextResponse.json(
			{ error: "Требуется авторизация" },
			{ status: 401 },
		);
	}

	let body: SuggestRequestBody;
	try {
		body = (await request.json()) as SuggestRequestBody;
	} catch {
		return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
	}

	const rawQuery = typeof body.query === "string" ? body.query : "";
	const query = rawQuery.trim().slice(0, MAX_QUERY_LENGTH);

	if (query.length < MIN_QUERY_LENGTH) {
		return ok({ suggestions: [], degraded: "too_short" });
	}

	if (!isDadataConfigured()) {
		return ok({ suggestions: [], degraded: "not_configured" });
	}

	const countInput = Number(body.count);
	const count = Number.isFinite(countInput)
		? Math.min(Math.max(Math.trunc(countInput), 1), MAX_COUNT)
		: DEFAULT_COUNT;
	const toBound = body.toBound === "city" ? "city" : undefined;

	const cacheKey = `${toBound ?? "full"}:${count}:${query.toLowerCase()}`;
	const cached = cache.get(cacheKey);
	if (cached) return ok({ suggestions: cached });

	// Лимит считается по пользователю, а не по IP: за одним корпоративным IP
	// сидит целый отдел, и общий счётчик отключал бы подсказки всем сразу.
	// Fail-open — подсказки вспомогательные, падение Redis не должно их гасить.
	const limit = await checkRateLimit(
		`address_suggest:${user.id}`,
		RATE_LIMIT,
		RATE_LIMIT_WINDOW_MS,
	);
	if (!limit.allowed) {
		return ok({ suggestions: [], degraded: "rate_limited" });
	}

	const result = await fetchAddressSuggestions({ query, count, toBound });

	if (!result.ok) {
		return ok({
			suggestions: [],
			degraded: mapFailureReason(result.reason),
		});
	}

	cache.set(cacheKey, result.suggestions);
	return ok({ suggestions: result.suggestions });
}
