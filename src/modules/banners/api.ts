import type { BannerEventInput } from "./schemas";
import type { BannerEventAck, NextBannerResponse } from "./types";

// HTTP-край баннеров в браузере.
//
// Тонкий слой, и это осознанно: вся политика — на сервере, здесь только
// «сказать, что произошло» и «спросить, что показывать». Ни одна из функций не
// решает, показывать ли баннер, — они лишь переносят вопрос и ответ.

async function parseJsonOrThrow<T>(
	res: Response,
	fallbackMessage: string,
): Promise<T> {
	if (!res.ok) {
		const body = await res.json().catch(() => null);
		throw new Error((body && "error" in body && body.error) || fallbackMessage);
	}
	return res.json() as Promise<T>;
}

/**
 * Спросить следующий баннер.
 *
 * `path` уходит параметром, потому что условие «на такой-то странице»
 * проверяется сервером по тому адресу, который вкладка назвала САМА и В ЭТОМ ЖЕ
 * запросе. Отдельного хранилища «где сейчас пользователь» нет — оно было бы
 * ответом на вопрос, который здесь не задаётся.
 */
export async function fetchNextBanner(
	path: string,
): Promise<NextBannerResponse> {
	const res = await fetch(
		`/api/banners/next?path=${encodeURIComponent(path)}`,
		// Ответ персональный и одноразовый: закэшированный браузером, он выдал
		// бы один и тот же `impressionId` дважды.
		{ cache: "no-store" },
	);
	return parseJsonOrThrow<NextBannerResponse>(
		res,
		"Не удалось получить баннер",
	);
}

/**
 * Сообщить о событии.
 *
 * Ошибки НЕ проглатываются здесь, а превращаются в «не разрешено и не
 * отозвано»: это правильная сторона компромисса для всего, кроме `impression`.
 * Не записанное закрытие означает строку, которой не хватит в отчёте;
 * показанный без разрешения баннер означает, что барьер обойдён сбоем сети.
 * Вызывающий разбирает `BannerEventAck` сам.
 */
export async function sendBannerEvent(
	input: BannerEventInput,
): Promise<BannerEventAck> {
	try {
		const res = await fetch("/api/banners/events", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(input),
		});
		return await parseJsonOrThrow<BannerEventAck>(
			res,
			"Не удалось записать событие баннера",
		);
	} catch {
		// Сеть отвалилась. `allowed: false` — потому что барьер не ответил
		// «можно», а показывать баннер, не получив разрешения, ровно то, от чего
		// барьер и защищает. `revoked: false` — потому что баннер не отозван и
		// вернётся при следующем отборе: состояние показа сервер не двигал.
		return { accepted: false, allowed: false, revoked: false, outcome: false };
	}
}

/** `impression` с ответом «можно ли открывать модалку». */
export function requestImpression(
	impressionId: string,
	path: string,
): Promise<BannerEventAck> {
	return sendBannerEvent({ impressionId, kind: "impression", path });
}
