import { randomUUID } from "node:crypto";
import { sql } from "@payloadcms/db-postgres";
import type { BasePayload, CollectionBeforeLoginHook } from "payload";
import { getFieldsToSign, jwtSign } from "payload";
import { checkUserStatus } from "@/payload/hooks/users/beforeLogin";

/**
 * Выдача JWT покупателю БЕЗ пароля — для входа через внешний сервис.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ НЕ payload.login()
 * ────────────────────────────────────────────────────────────────────────────
 * payload.login() — единственный публичный способ получить токен, и он
 * требует пароль. Аккаунт, заведённый через Яндекс ID, пароля, известного
 * кому-либо, не имеет (hasPassword: false), а у привязанного аккаунта пароль
 * знает человек, но не мы. Регистрация сессии (addSessionToUser), от которой
 * зависит проверка JWT при auth.useSessions, в Payload 3.85.1 наружу не
 * экспортирована (см. и pendingAuth.ts). Поэтому здесь вручную повторено то,
 * что делает node_modules/payload/dist/auth/operations/login.js ПОСЛЕ сверки
 * пароля:
 *
 *   1. checkLoginPermission / beforeLogin — проверки допуска (ниже, п. «Кого
 *      пускаем»);
 *   2. addSessionToUser — строка в users_sessions с uuid `sid` и сроком
 *      tokenExpiration; заодно чистятся истёкшие (removeExpiredSessions);
 *   3. getFieldsToSign + jwtSign — те же claims тем же секретом
 *      (payload.secret — уже производный ключ, им же подписывает login).
 *
 * resetLoginAttempts не повторяется намеренно: счётчик относится к паролю, и
 * вход через Яндекс не должен ни сбрасывать его, ни снимать блокировку.
 *
 * ⚠ При обновлении Payload сверить заново с login.js и sessions.js: формат
 * claims и таблицы users_sessions — внутренности, не контракт. Если появится
 * публичный вход без пароля — заменить этот файл им.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * КОГО ПУСКАЕМ
 * ────────────────────────────────────────────────────────────────────────────
 * • status blocked/suspended — нет, той же ошибкой, что и при входе паролем
 *   (checkUserStatus — один источник правды).
 * • lockUntil (блокировка после 10 неверных паролей) — да. Блокировка защищает
 *   пароль от подбора; вход через Яндекс пароль не проверяет, и запирать
 *   владельца аккаунта из-за чужих попыток подбора было бы наказанием жертвы.
 *   Решение записано в oauth/CHECKLIST.md, раздел 7.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЧЕГО ЗДЕСЬ НЕТ
 * ────────────────────────────────────────────────────────────────────────────
 * Cookie. Токен возвращается вызывающему, а выставляет его completeLogin —
 * единственное место, где гость становится авторизованным. На пути с кодом
 * (привязка, подтверждение почты) токен сначала ждёт в pending-auth, как и
 * токен из payload.login() на обычном входе.
 */

const USERS = "users";

export interface IssuedSession {
	token: string;
	email: string;
	name: string;
}

export async function issueSessionWithoutPassword(
	payload: BasePayload,
	userId: number | string,
): Promise<IssuedSession> {
	const collectionConfig = payload.collections[USERS].config;

	const user = await payload.findByID({
		collection: USERS,
		id: Number(userId),
		depth: 0,
		overrideAccess: true,
	});

	// Та же проверка статуса, что у входа паролем; бросает
	// AccountBlockedError / AccountSuspendedError.
	await (checkUserStatus as (args: { user: typeof user }) => unknown)({
		user,
	} as Parameters<CollectionBeforeLoginHook>[0]);

	let sid: string | undefined;
	if (collectionConfig.auth.useSessions) {
		sid = randomUUID();
		const now = new Date();
		const expiresAt = new Date(
			now.getTime() + collectionConfig.auth.tokenExpiration * 1000,
		);
		await payload.db.drizzle.execute(sql`
			WITH purged AS (
				DELETE FROM users_sessions
				WHERE _parent_id = ${user.id} AND expires_at <= ${now.toISOString()}
			)
			INSERT INTO users_sessions (_order, _parent_id, id, created_at, expires_at)
			SELECT COALESCE(MAX(_order), 0) + 1, ${user.id}, ${sid},
			       ${now.toISOString()}, ${expiresAt.toISOString()}
			FROM users_sessions WHERE _parent_id = ${user.id}
		`);
	}

	const fieldsToSign = getFieldsToSign({
		collectionConfig,
		email: user.email,
		sid,
		user: { ...user, collection: USERS } as Parameters<
			typeof getFieldsToSign
		>[0]["user"],
	});

	const { token } = await jwtSign({
		fieldsToSign,
		secret: payload.secret,
		tokenExpiration: collectionConfig.auth.tokenExpiration,
	});

	return { token, email: user.email, name: user.name ?? "" };
}
