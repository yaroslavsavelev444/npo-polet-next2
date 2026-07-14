// src/modules/auth/lib/legacyPasswordFallback.ts
import bcrypt from "bcryptjs";
import type { Payload } from "payload";

/**
 * Старые пароли (прошлая система) хешировались bcrypt'ом; Payload's local
 * strategy хеширует PBKDF2-SHA256 с отдельными hash/salt — форматы
 * несовместимы, поэтому `payload.login()` всегда отклонит верный старый
 * пароль мигрированного пользователя. Вызывается ТОЛЬКО из catch-блока
 * loginAction после того, как обычный payload.login() уже провалился.
 *
 * При успехе перехеширует пароль в формат Payload (через payload.update —
 * поле `password` там триггерит generatePasswordSaltHash) и очищает
 * legacyPasswordHash, так что fallback для этого пользователя больше не
 * понадобится ни разу.
 *
 * Возвращает true, если пароль подтверждён через legacy-хеш (тогда
 * повторный payload.login() в loginAction должен сразу пройти обычным
 * путём); false — если fallback неприменим (нет пользователя/хеша) или
 * пароль неверен.
 */
export async function tryLegacyPasswordFallback(
	payload: Payload,
	email: string,
	password: string,
): Promise<boolean> {
	const { docs } = await payload.find({
		collection: "users",
		where: { email: { equals: email } },
		limit: 1,
		overrideAccess: true,
		// legacyPasswordHash имеет access.read: () => false — обычный select
		// его не отдаёт даже при overrideAccess на уровне операции, поле нужно
		// запросить явно через select.
		select: { legacyPasswordHash: true },
	});

	const user = docs[0];
	const legacyHash = user?.legacyPasswordHash;
	if (!user || !legacyHash) return false;

	const isValid = await bcrypt.compare(password, legacyHash);
	if (!isValid) return false;

	await payload.update({
		collection: "users",
		id: user.id,
		data: {
			password,
			legacyPasswordHash: null,
			legacyPasswordMigrated: true,
		},
		overrideAccess: true,
	});

	return true;
}
