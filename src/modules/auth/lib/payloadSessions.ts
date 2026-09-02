import { sql } from "@payloadcms/db-postgres";
import type { BasePayload } from "payload";

/**
 * Отзыв сессий на уровне САМОГО Payload.
 *
 * Зачем отдельно от коллекции `sessions`. У коллекции users включён
 * (по умолчанию, см. node_modules/payload/dist/collections/config/defaults.js)
 * `auth.useSessions: true`: при выдаче токена Payload кладёт в JWT claim `sid`
 * и добавляет строку в таблицу `users_sessions`, а JWT-стратегия на КАЖДОМ
 * запросе сверяет `sid` из токена с этой таблицей (см.
 * node_modules/payload/dist/auth/strategies/jwt.js). Если строки нет — токен
 * считается невалидным, и `payload.auth()` возвращает `user: null`.
 *
 * Наша коллекция `sessions` — это витрина «Активные устройства» и аудит; она
 * НЕ влияет на валидность JWT. Пока отзыв жил только в ней, «выйти»,
 * «выйти со всех устройств», смена и сброс пароля не инвалидировали сам
 * токен: он продолжал работать во всех Server Actions, Route Handlers и
 * Payload REST (там проверки нашей сессии нет вовсе), а гейт в proxy.ts
 * пропускал запрос, если клиент просто не присылал cookie `session-id`
 * (см. resolveSessionStatus: проверка сессии выполнялась только при её
 * наличии). Украденный/сохранённый payload-token переживал и logout, и смену
 * пароля вплоть до истечения своих 7 суток.
 *
 * Поэтому отзыв обязан доходить до `users_sessions` — единственной границы,
 * которую соблюдает сам Payload на всех транспортах сразу. Работаем прямым
 * SQL (как в account-deletion service): это одна атомарная операция без
 * read-modify-write гонки, в которую превращается запись массива
 * `users.sessions` через payload.update при параллельных входах/выходах.
 */

const SID_CLAIM = "sid";

/**
 * Достаёт claim `sid` из JWT, выданного payload.login()/resetPassword().
 *
 * Подпись НЕ проверяется намеренно: сюда попадает только токен, который наш
 * же серверный код получил из Payload несколькими строками выше (см.
 * verifyOtp.ts). Для токена из cookie пользоваться этим нельзя — там источник
 * истины `user._sid`, который Payload проставляет после проверки подписи.
 */
export function extractPayloadSessionId(token: string): string | null {
	const segments = token.split(".");
	if (segments.length !== 3) return null;
	try {
		const claims = JSON.parse(
			Buffer.from(segments[1], "base64url").toString("utf8"),
		) as Record<string, unknown>;
		const sid = claims[SID_CLAIM];
		return typeof sid === "string" && sid.length > 0 ? sid : null;
	} catch {
		return null;
	}
}

/** Инвалидирует один конкретный JWT пользователя (по его claim `sid`). */
export async function revokePayloadSession(
	payload: BasePayload,
	userId: number | string,
	sid: string,
): Promise<void> {
	await payload.db.drizzle.execute(sql`
		DELETE FROM users_sessions
		WHERE _parent_id = ${Number(userId)} AND id = ${sid}
	`);
}

/**
 * Инвалидирует ВСЕ JWT пользователя, кроме (опционально) одного.
 *
 * Используется там, где отзыв должен быть полным независимо от того, есть ли
 * для токена запись в нашей коллекции `sessions`: выход со всех устройств,
 * смена и сброс пароля. Без «кроме» смена пароля из профиля выкинула бы и
 * того, кто её только что подтвердил.
 */
export async function revokeAllPayloadSessions(
	payload: BasePayload,
	userId: number | string,
	exceptSid?: string | null,
): Promise<void> {
	if (exceptSid) {
		await payload.db.drizzle.execute(sql`
			DELETE FROM users_sessions
			WHERE _parent_id = ${Number(userId)} AND id <> ${exceptSid}
		`);
		return;
	}

	await payload.db.drizzle.execute(sql`
		DELETE FROM users_sessions WHERE _parent_id = ${Number(userId)}
	`);
}

/**
 * `sid` токена, привязанного к записи нашей коллекции `sessions`.
 * Прямой SQL, чтобы не зависеть от видимости поля в ответах Payload.
 */
export async function getSidForSessionRow(
	payload: BasePayload,
	sessionId: number | string,
): Promise<string | null> {
	const numericId = Number(sessionId);
	if (!Number.isFinite(numericId)) return null;

	const result = (await payload.db.drizzle.execute(sql`
		SELECT payload_session_id FROM sessions WHERE id = ${numericId}
	`)) as { rows?: { payload_session_id: string | null }[] };

	return result.rows?.[0]?.payload_session_id ?? null;
}
