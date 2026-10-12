import type { IncomingHttpHeaders } from "node:http";
import { NextResponse } from "next/server";
import { redis } from "@/modules/auth/lib/redis";
import { getPayloadInstance } from "@/payload/services/getPayload";
import { captureError } from "@/services/observability/capture";
import type { SupportErrorCode } from "../lib/events.ts";
import { getRedisBroadcaster } from "./broadcast.ts";
import { isSupportError, SupportError } from "./errors.ts";
import { authenticate, isAllowedHandshakeSource } from "./gateway/auth.ts";
import {
	CHAT_BANNED_MESSAGE,
	type CustomerActor,
	type StaffActor,
	type SupportActor,
} from "./permissions.ts";
import { getSupportConfig, isChatOpenForUser } from "./settings.ts";
import type { SupportDeps } from "./support.service.ts";

/**
 * Обвязка Route Handlers чата (`app/api/support/**`).
 *
 * Те же правила, что у шлюза: участник по cookie сессии Payload (покупатель
 * на витрине, менеджер на хосте админки — cookie host-only, каждый видит
 * свою), изменяющие запросы — только со своего сайта, ответы с персональными
 * данными — без кэша.
 */

const NO_STORE = {
	"Cache-Control": "private, no-store",
	"X-Robots-Tag": "noindex, nofollow",
};

const STATUS: Record<SupportErrorCode, number> = {
	unauthorized: 401,
	forbidden: 403,
	disabled: 403,
	invalid: 400,
	consent_required: 400,
	not_found: 404,
	conflict: 409,
	rate_limited: 429,
	internal: 500,
};

export function json<T>(
	data: T,
	init: { status?: number; headers?: Record<string, string> } = {},
) {
	return NextResponse.json(data, {
		status: init.status ?? 200,
		headers: { ...NO_STORE, ...init.headers },
	});
}

export function errorResponse(error: unknown, route: string): NextResponse {
	if (isSupportError(error)) {
		return json(
			{ error: { code: error.code, message: error.message } },
			{ status: STATUS[error.code] },
		);
	}
	const errorId = captureError(error, {
		source: "http",
		module: "support-chat",
		http: { route, status: 500 },
	});
	console.error(`[support-chat] ${route} failed`, { errorId });
	return json(
		{
			error: {
				code: "internal",
				message: "Что-то пошло не так, повторите попытку",
			},
		},
		{ status: 500 },
	);
}

function toNodeHeaders(headers: Headers): IncomingHttpHeaders {
	const result: IncomingHttpHeaders = {};
	headers.forEach((value, key) => {
		result[key] = value;
	});
	return result;
}

export async function resolveActor(
	request: Request,
): Promise<SupportActor | null> {
	const payload = await getPayloadInstance();
	return authenticate(payload, {
		cookie: request.headers.get("cookie") ?? undefined,
		origin: request.headers.get("origin") ?? undefined,
		secFetchSite: request.headers.get("sec-fetch-site") ?? undefined,
	});
}

/**
 * Изменяющий запрос — только со своего сайта. Cookie с SameSite=Lax на
 * кросс-сайтовый POST и так не уйдёт, но защита не должна держаться на
 * одном атрибуте cookie.
 */
export function assertSameSite(request: Request): void {
	const allowed = (process.env.ALLOWED_ORIGINS ?? "")
		.split(",")
		.map((origin) => origin.trim())
		.filter(Boolean);
	if (!isAllowedHandshakeSource(toNodeHeaders(request.headers), allowed)) {
		throw new SupportError("forbidden", "Запрос с чужого сайта");
	}
}

export async function requireActor(request: Request): Promise<SupportActor> {
	const actor = await resolveActor(request);
	if (!actor) throw new SupportError("unauthorized", "Войдите в аккаунт");
	return actor;
}

export async function requireCustomer(
	request: Request,
): Promise<CustomerActor> {
	const actor = await requireActor(request);
	if (actor.kind !== "customer")
		throw new SupportError("forbidden", "Только для покупателей");
	if (actor.chatBanned)
		throw new SupportError("forbidden", CHAT_BANNED_MESSAGE);
	const config = await getSupportConfig(await getPayloadInstance());
	if (!isChatOpenForUser(config, actor.userId)) {
		throw new SupportError("disabled", "Чат с менеджером пока недоступен");
	}
	return actor;
}

export async function requireStaff(request: Request): Promise<StaffActor> {
	const actor = await requireActor(request);
	if (actor.kind !== "staff")
		throw new SupportError("forbidden", "Только для менеджеров");
	return actor;
}

/** Зависимости сервиса для процесса Next: события уходят через Redis. */
export async function supportDeps(): Promise<SupportDeps> {
	return {
		payload: await getPayloadInstance(),
		redis,
		broadcaster: getRedisBroadcaster(),
	};
}

/** Целое положительное из строки запроса или null. */
export function positiveInt(value: string | null): number | null {
	if (value === null || !/^\d{1,10}$/.test(value)) return null;
	const parsed = Number(value);
	return parsed > 0 ? parsed : null;
}
