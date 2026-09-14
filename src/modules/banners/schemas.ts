import { z } from "zod";
import { BANNER_CLOSE_METHODS, BANNER_EVENT_KINDS } from "./vocabulary.ts";

// Контракты сетевого края системы баннеров.
//
// Схемы читает маршрут (`app/api/banners/*`) и, косвенно, клиент — через
// выводимые из них типы. Тело запроса — недоверенный ввод, и типизированная
// сигнатура на проводе это комментарий, а не проверка.

/** Разумная длина пути. Всё длиннее — не навигация, а попытка что-то сломать. */
const MAX_PATH_LENGTH = 512;

/**
 * Адрес, на котором находится вкладка.
 *
 * Приходит параметром запроса за следующим баннером и полем события. В
 * исходной системе этот факт хранился в Redis с коротким TTL, потому что
 * баннер приходил пользователю по сокету и сервер обязан был знать экран
 * заранее. Здесь баннер запрашивает сам браузер — и приносит свой адрес тем же
 * запросом. Хранилище «где сейчас пользователь» стало не нужно вовсе: факт
 * живёт ровно столько, сколько длится запрос, которому он нужен.
 */
export const bannerPathSchema = z
	.string()
	.max(MAX_PATH_LENGTH)
	.refine((value) => value.startsWith("/") && !value.startsWith("//"), {
		message: "Путь должен начинаться с одной косой черты",
	});

export const nextBannerQuerySchema = z.object({
	path: bannerPathSchema.optional(),
});

/**
 * События, которые вправе прислать браузер.
 *
 * `delivered` и `outcome` из списка исключены, и это не оплошность: первое
 * пишет сервер в момент выдачи, второе выводится из правила успеха, которое
 * браузеру неизвестно. Приняв их снаружи, мы дали бы клиенту возможность
 * объявить баннер успешным, ни разу его не показав, — то есть отключить себе
 * повторные показы важных баннеров.
 */
export const CLIENT_BANNER_EVENT_KINDS = BANNER_EVENT_KINDS.filter(
	(
		kind,
	): kind is Exclude<
		(typeof BANNER_EVENT_KINDS)[number],
		"delivered" | "outcome"
	> => kind !== "delivered" && kind !== "outcome",
);

/**
 * Одно взаимодействие с баннером.
 *
 * `impressionId` — единственный пропуск: он выдан сервером, случаен и записан
 * в журнал выдачи. Ни `userId`, ни `bannerId` в запросе нет намеренно — их
 * знает сервер, а присланные клиентом они были бы приглашением подставить
 * чужие.
 */
export const bannerEventSchema = z.object({
	impressionId: z.uuid("Некорректный идентификатор показа"),
	kind: z.enum(CLIENT_BANNER_EVENT_KINDS),
	/**
	 * Длительность просмотра, мс — от открытия модалки до события.
	 *
	 * Считает браузер, потому что только он знает момент открытия; сервер
	 * ограничивает значение сверху (`server/events.ts`). Точность здесь не
	 * критична, а порядок величины — да: на нём держится критерий «прочитал».
	 */
	dwellMs: z
		.number()
		.int()
		.min(0)
		.max(24 * 60 * 60_000)
		.optional(),
	closeMethod: z.enum(BANNER_CLOSE_METHODS).optional(),
	path: bannerPathSchema.optional(),
	href: z.string().max(2048).optional(),
});

export type BannerEventInput = z.infer<typeof bannerEventSchema>;
