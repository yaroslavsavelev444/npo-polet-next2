// Расширения в путях указаны явно — как в файлах графа payload.config.ts и по
// той же причине: этот модуль загружается НАТИВНЫМ ESM-резолвером Node, без
// сборщика и без достраивания расширений (см. tests/security —
// trusted-device-policy.test.ts запускается через `node --test`). Опустив
// ".ts", мы получили бы ERR_MODULE_NOT_FOUND, и правило, ради проверки
// которого файл и выделен, перестало бы проверяться.
import { deviceFingerprint, networkPrefix } from "./network.ts";
import { TRUSTED_DEVICE_ROTATION_GRACE_MS } from "./trustedDevice.db.ts";

/**
 * Решение «верить ли этому устройству» — чистая функция над уже прочитанными
 * данными.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ ОТДЕЛЬНО ОТ trustedDevice.ts
 * ────────────────────────────────────────────────────────────────────────────
 * Здесь решается единственный по-настоящему опасный вопрос всего механизма:
 * пускать ли человека в аккаунт без второго фактора. У такого правила должен
 * быть способ проверки таблицей значений, а не наблюдением за продом, — и
 * большинство его веток в браузере не воспроизвести вовсе: чтобы увидеть
 * смену подсети, нужно физически сменить сеть, а чтобы увидеть повторное
 * использование секрета — иметь копию чужой cookie.
 *
 * Поэтому IO (cookie, база, отзыв доверия) осталось в trustedDevice.ts, а
 * сюда вынесено правило. Тот же приём и по той же причине, что у баннеров:
 * `conditions.ts` — чистые предикаты, `server/facts.ts` — чтение.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОРЯДОК ПРОВЕРОК ЗНАЧИМ
 * ────────────────────────────────────────────────────────────────────────────
 * Совпадение секрета проверяется ПОСЛЕ владельца, но ДО отпечатка и сети — и
 * это не вкусовщина.
 *
 *  • владелец раньше секрета: cookie другого аккаунта на общем компьютере —
 *    обычное дело, и трактовать её как кражу нельзя;
 *  • секрет раньше отпечатка и сети: несовпадение секрета означает возможную
 *    кражу и требует отзыва ВСЕХ устройств, а несовпадение сети — всего лишь
 *    «человек переехал» и обязано остаться безобидным. Проверь мы сеть
 *    первой, кража из другой сети выглядела бы как переезд и молча прошла бы
 *    мимо защиты.
 */

/** Что известно о записи устройства на момент решения. */
export interface TrustedDeviceSnapshot {
	/** Владелец записи (id, а не объект). */
	userId: string;
	/** SHA-256 текущего секрета. */
	tokenHash: string;
	/** SHA-256 предыдущего секрета; null — ротации ещё не было. */
	previousTokenHash: string | null;
	/** Когда секрет менялся в последний раз (ISO). */
	rotatedAt: string | null;
	fingerprint: string;
	ipPrefix: string | null;
	expiresAt: string;
	revoked: boolean;
}

/** Обстоятельства текущей попытки входа. */
export interface TrustAttempt {
	/** Кто только что подтвердил пароль. */
	userId: string;
	/** SHA-256 секрета, предъявленного cookie. */
	presentedTokenHash: string;
	ip: string;
	userAgent: string;
	/** Тип устройства из User-Agent (parseDeviceLabel). */
	deviceLabel: string;
	now?: Date;
}

/**
 * Почему устройству не поверили.
 *
 * Наружу пользователю НЕ показывается: знать, по какому именно признаку не
 * прошла проверка, полезно только тому, кто её обходит. Значение уходит в лог
 * и в аудит.
 */
export type TrustDenialReason =
	| "no_cookie"
	| "unknown_device"
	| "revoked"
	| "expired"
	| "other_user"
	| "fingerprint_changed"
	| "network_changed"
	| "secret_reused"
	| "staff_account";

export type TrustVerdict =
	| { trusted: true }
	| {
			trusted: false;
			reason: TrustDenialReason;
			/**
			 * Предъявлен секрет, который мы когда-то выдавали, но он давно
			 * заменён. Отличить законного владельца от того, кто скопировал
			 * cookie, нечем, поэтому доверие снимается со ВСЕХ устройств
			 * пользователя — разбор в шапке trustedDevice.ts.
			 */
			revokeAll?: true;
			/** Cookie мертва — её стоит удалить, чтобы не предъявлялась впредь. */
			dropCookie?: true;
	  };

export function decideTrust(
	device: TrustedDeviceSnapshot,
	attempt: TrustAttempt,
): TrustVerdict {
	const now = attempt.now ?? new Date();

	if (device.revoked) {
		return { trusted: false, reason: "revoked", dropCookie: true };
	}

	if (new Date(device.expiresAt) <= now) {
		return { trusted: false, reason: "expired", dropCookie: true };
	}

	// Тем же браузером мог войти другой человек. Это не нарушение: cookie
	// просто не относится к этому аккаунту, и вход пойдёт через код. Cookie при
	// этом НЕ удаляем — она принадлежит другому аккаунту и ещё пригодится ему.
	if (String(device.userId) !== String(attempt.userId)) {
		return { trusted: false, reason: "other_user" };
	}

	const matchesCurrent = device.tokenHash === attempt.presentedTokenHash;
	const matchesPrevious =
		!matchesCurrent &&
		device.previousTokenHash !== null &&
		device.previousTokenHash === attempt.presentedTokenHash &&
		withinRotationGrace(device.rotatedAt, now);

	if (!matchesCurrent && !matchesPrevious) {
		return {
			trusted: false,
			reason: "secret_reused",
			revokeAll: true,
			dropCookie: true,
		};
	}

	if (
		device.fingerprint !==
		deviceFingerprint(attempt.deviceLabel, attempt.userAgent)
	) {
		return { trusted: false, reason: "fingerprint_changed" };
	}

	const prefix = networkPrefix(attempt.ip);
	if (prefix === null || device.ipPrefix !== prefix) {
		return { trusted: false, reason: "network_changed" };
	}

	return { trusted: true };
}

/**
 * Прошлый секрет ещё принимается.
 *
 * Окно нужно для гонки: две открытые вкладки или повтор запроса при потере
 * сети предъявляют один и тот же секрет почти одновременно, и второй из них
 * без окна выглядел бы кражей. Неизвестное время ротации окном не считается —
 * отказ закрытый.
 */
function withinRotationGrace(rotatedAt: string | null, now: Date): boolean {
	if (!rotatedAt) return false;
	const at = Date.parse(rotatedAt);
	if (Number.isNaN(at)) return false;
	return now.getTime() - at <= TRUSTED_DEVICE_ROTATION_GRACE_MS;
}
