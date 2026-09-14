"use client";

// Экранное время: секунды, которые вкладка ДЕЙСТВИТЕЛЬНО БЫЛА ВИДНА.
//
// ─── Почему не обычный `setTimeout` ────────────────────────────────────────
//
// «Показать через три минуты» означает три минуты работы человека, а не три
// минуты календарного времени. Обычный таймер в свёрнутой вкладке отсчитает
// своё (браузер его притормозит, но не остановит), и модалка встретит
// покупателя в тот момент, когда он через час вернётся к забытой вкладке — то
// есть ровно тогда, когда её появление ничем не мотивировано и выглядит как
// сбой.
//
// Здесь время идёт только при `visibilityState === "visible"`. Побочный эффект
// приятный: баннер не расходует показ на человека, который его не увидит, — а
// показ у важного баннера ограничен.

/** Как часто проверять, набралось ли время. Секунда — достаточная точность. */
const TICK_MS = 1_000;

/**
 * Отсчитать `seconds` видимого времени и вызвать `onElapsed`.
 *
 * Возвращает функцию отмены. Ноль секунд — вызов на следующем тике, а не
 * синхронно: синхронный вызов из эффекта React означал бы установку состояния
 * во время рендера у вызывающего.
 */
export function startScreenTimer(
	seconds: number,
	onElapsed: () => void,
): () => void {
	let elapsedMs = 0;
	let lastTick = Date.now();
	let done = false;

	const targetMs = Math.max(0, seconds) * 1000;

	const tick = () => {
		const now = Date.now();
		const delta = now - lastTick;
		lastTick = now;

		// Копится только видимое время. Заодно это защита от скачка системных
		// часов и от «проснувшегося» ноутбука: невидимая вкладка не прибавляет
		// ничего, сколько бы ни прошло.
		if (document.visibilityState === "visible") elapsedMs += delta;

		if (done || elapsedMs < targetMs) return;

		done = true;
		clearInterval(timer);
		onElapsed();
	};

	const timer = setInterval(tick, TICK_MS);

	// Возврат на вкладку — повод проверить сразу, а не через секунду. Разница
	// невелика, но именно она отличает «баннер появился, когда я вернулся» от
	// «баннер появился через секунду после того, как я вернулся и уже начал
	// читать».
	const onVisibility = () => {
		lastTick = Date.now();
		if (document.visibilityState === "visible") tick();
	};

	document.addEventListener("visibilitychange", onVisibility);

	return () => {
		done = true;
		clearInterval(timer);
		document.removeEventListener("visibilitychange", onVisibility);
	};
}

/**
 * Счётчик видимого времени с момента создания.
 *
 * Нужен, чтобы знать, сколько человек уже провёл на сайте к моменту, когда
 * баннер пришёл: прогрев сессии тратится ОДИН РАЗ ЗА ВКЛАДКУ, а не перед
 * каждым баннером — иначе второй баннер в очереди ждал бы полторы минуты после
 * того, как человек уже полчаса выбирает товар.
 */
export function createScreenClock(): {
	elapsedSeconds: () => number;
	stop: () => void;
} {
	let elapsedMs = 0;
	let lastTick = Date.now();

	const tick = () => {
		const now = Date.now();
		if (document.visibilityState === "visible") elapsedMs += now - lastTick;
		lastTick = now;
	};

	const timer = setInterval(tick, TICK_MS);
	const onVisibility = () => tick();
	document.addEventListener("visibilitychange", onVisibility);

	return {
		elapsedSeconds: () => {
			tick();
			return elapsedMs / 1000;
		},
		stop: () => {
			clearInterval(timer);
			document.removeEventListener("visibilitychange", onVisibility);
		},
	};
}
