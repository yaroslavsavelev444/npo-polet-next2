import { createHash } from "node:crypto";
import type { CaptureContext, NormalizedError } from "./types.ts";

// Отпечаток — ключ, по которому «та же ошибка» отличается от «другой». От
// него зависят дедупликация, счётчики и паузы.
//
// Входит: источник, модуль, класс ошибки, код, ОЧИЩЕННОЕ сообщение и три
// верхних собственных кадра стека — файл и имя функции.
//
// Не входит номер строки: он меняется от любой правки выше по файлу, и после
// косметического коммита та же ошибка приезжала бы как новая — со сброшенной
// паузой и счётчиком. Не входит сырое сообщение: иначе нарушение
// уникальности на двух разных адресах дало бы два отпечатка, и сбойный индекс
// прислал бы столько писем, сколько людей в него упёрлось. Не входит
// выкладка: ошибка, пережившая деплой, обязана остаться той же ошибкой.

const SIGNIFICANT_FRAMES = 3;

const SEP = "\u0000";

export function computeFingerprint(
	error: NormalizedError,
	context: Pick<CaptureContext, "source" | "module">,
): string {
	const own = error.frames
		.filter((frame) => !frame.vendor)
		.slice(0, SIGNIFICANT_FRAMES)
		.map((frame) => `${frame.file}#${frame.fn ?? "?"}`);

	// Собственных кадров может не быть (ошибка родилась в библиотеке или стек
	// потерян) — тогда первый кадр, какой есть, иначе все такие ошибки
	// схлопнутся в один отпечаток.
	const first = error.frames[0];
	const frames =
		own.length > 0 ? own : first ? [`${first.file}#${first.fn ?? "?"}`] : [];

	const material = [
		context.source,
		context.module ?? "",
		error.name,
		error.code ?? "",
		error.message,
		...frames,
	].join(SEP);

	return createHash("sha256").update(material).digest("hex").slice(0, 16);
}
