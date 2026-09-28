import { createHmac } from "node:crypto";

// Псевдоним пользователя для письма.
//
// При разборе аварии второй вопрос после «что сломалось» — «у всех или у
// одного»: сто повторов это либо сто пострадавших, либо один человек, сто
// раз нажавший кнопку. Идентификатор пользователя — персональные данные, и в
// письмо он не идёт. HMAC даёт признак «тот же / другой», не раскрывая, кто
// это; ключ сервер не покидает, а полная запись всё равно лежит в журнале.
//
// Ключ — PAYLOAD_SECRET: он есть в каждом процессе проекта, а заводить ради
// одного необязательного поля отдельный секрет незачем. Назначение
// подмешано в материал, чтобы псевдоним не совпадал ни с каким другим
// производным от того же секрета.

const PURPOSE = "alert-user";

const LENGTH = 8;

/**
 * `undefined` — и когда пользователя нет, и когда ключ не задан: оповещение
 * не должно ломаться из-за необязательного поля.
 */
export function userPseudonym(
	userId: string | number | null | undefined,
): string | undefined {
	if (userId === null || userId === undefined || userId === "") {
		return undefined;
	}

	const key = process.env.PAYLOAD_SECRET?.trim();
	if (!key) return undefined;

	const digest = createHmac("sha256", key)
		.update(`${PURPOSE}\u0000${userId}`)
		.digest("hex")
		.slice(0, LENGTH);

	return `u:${digest}`;
}
