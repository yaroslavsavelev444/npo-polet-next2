import { getPayloadInstance } from "@/payload/services/getPayload";
import type { BannerState } from "@/payload-types";
import type { BannerClientContext } from "../conditions";
import { nextShowAt, outcomeReached } from "../policy";
import type { BannerEventAck } from "../types";
import type { BannerCloseMethod, BannerEventKind } from "../vocabulary";
import { findLiveBanner } from "./definitions";
import { releaseInFlight } from "./delivery";
import { verifyBannerForUser } from "./eligibility";

// Запись взаимодействий и пересчёт состояния показа.
//
// ─── Что здесь считается доверенным ────────────────────────────────────────
//
// Ничего из присланного браузером, кроме факта наличия у него `impressionId`,
// который выдал сервер. Идентификатор показа — единственный пропуск: он
// случаен, отдан ровно одному пользователю и записан в его строку состояния.
// Поэтому проверка «чей это показ» — это чтение состояния по идентификатору, а
// не сверка присланного `userId` (которого в запросе и нет) и не доверие полю
// `bannerId`.
//
// ⚠ Владельца показа определяет `banner-states.lastImpressionId`, а НЕ журнал
// событий, хотя событие `delivered` тоже содержит идентификатор. Разница в
// надёжности: строка состояния пишется в горячем пути и её сбой роняет выдачу,
// а журнал — аналитика, его запись намеренно best-effort. Опознавай мы показ по
// журналу, единственный потерянный `delivered` превратил бы выданный баннер в
// призрак: события по нему отвергались бы как чужие, а «полёт» висел бы до
// протухания.
//
// ─── Идемпотентность ───────────────────────────────────────────────────────
//
// Уникальный индекс `(impressionId, kind)` на `banner-events` делает повтор
// невозможным на уровне базы, а не на уровне намерения. Это существенно:
// события идут по обычному HTTP, и их повторяют и браузер (retry), и
// пользователь (две вкладки), и React StrictMode в разработке. Обработка
// «вставили — значит первое; конфликт — значит уже было» не требует ни
// блокировки, ни чтения перед записью и переживает гонку двух запросов.
//
// ─── Почему состояние двигается только «первым» событием ───────────────────
//
// Счётчики показов и выдержка обновляются исключительно в ветке, где вставка
// прошла. Иначе повторно присланное закрытие второй раз увеличило бы
// длительность просмотра и сдвинуло следующий показ — и обнаружилось бы это в
// виде «баннер повторяется реже, чем настроено», без единого следа в логах.

/** Верхняя граница присланной длительности: сутки в модалке — это не просмотр. */
const MAX_DWELL_MS = 30 * 60_000;

export type BannerInteraction = {
	impressionId: string;
	kind: Exclude<BannerEventKind, "delivered" | "outcome">;
	/** Только у `dismiss` и `view`: от открытия модалки до события. */
	dwellMs?: number;
	closeMethod?: BannerCloseMethod;
	path?: string;
	href?: string;
};

/**
 * Записать взаимодействие и пересчитать состояние.
 *
 * Возвращает `null`, когда показ не найден или принадлежит другому
 * пользователю. Одно значение на оба случая намеренно: различить их — значит
 * сообщить владельцу подобранного идентификатора, что такой показ существует.
 */
export async function recordInteraction(params: {
	userId: number;
	interaction: BannerInteraction;
	now?: Date;
}): Promise<BannerEventAck | null> {
	const { userId, interaction } = params;
	const now = params.now ?? new Date();

	const state = await findStateByImpression(interaction.impressionId);

	if (!state || relationId(state.user) !== userId) return null;

	const bannerId = relationId(state.banner);
	const dwellMs = clampDwell(interaction.dwellMs);
	const context: BannerClientContext | null = interaction.path
		? { path: interaction.path }
		: null;

	// ── Барьер показа ──────────────────────────────────────────────────────
	//
	// Клиент спрашивает разрешения ПЕРЕД тем, как открыть модалку, и это
	// главная защита от показа снятого, удалённого или ещё не проверенного
	// баннера. Между выдачей и показом проходит до нескольких минут (задержка
	// баннера, прогрев сессии, свёрнутая вкладка), и за это время
	// администратор успевает нажать «пауза», а покупатель — перестать подходить
	// под условия, оформив тот самый заказ, отсутствие которого и было условием.
	//
	// Проверка полная и с нуля: жив ли баннер, окно проверки, окно показа,
	// серверные условия, политика повторов. Дешёвого варианта здесь нет и не
	// должно быть — это единственное место, где решается, увидит ли человек
	// баннер, и стоит оно один проход НА ПОКАЗ, а не на запрос.
	if (interaction.kind === "impression") {
		const live = await verifyBannerForUser({ userId, bannerId, context, now });

		if (!live) {
			// «Полёт» снимается: очередь этого пользователя не должна стоять
			// из-за баннера, который решено не показывать.
			await releaseInFlight(userId, bannerId);

			return {
				accepted: false,
				allowed: false,
				revoked: true,
				outcome: false,
			};
		}
	}

	const inserted = await insertEvent({
		bannerId,
		userId,
		impressionId: interaction.impressionId,
		kind: interaction.kind,
		at: now,
		sequence: (state.impressions ?? 0) + 1,
		dwellMs,
		closeMethod: interaction.closeMethod,
		path: interaction.path,
		href: interaction.href,
	});

	if (!inserted) {
		// Событие уже было. Разрешение при этом остаётся выданным: барьер выше
		// уже ответил «можно» и от повторения вопроса своего мнения не меняет.
		return { accepted: false, allowed: true, revoked: false, outcome: false };
	}

	return await applyToState({
		userId,
		bannerId,
		state,
		interaction,
		dwellMs,
		now,
	});
}

/* --------------------------------------------------------------- чтение --- */

async function findStateByImpression(
	impressionId: string,
): Promise<BannerState | null> {
	const payload = await getPayloadInstance();

	const result = await payload.find({
		collection: "banner-states",
		where: { lastImpressionId: { equals: impressionId } },
		limit: 1,
		depth: 0,
		overrideAccess: true,
	});

	return result.docs[0] ?? null;
}

function relationId(value: number | { id: number }): number {
	return typeof value === "object" ? value.id : value;
}

function clampDwell(value: number | undefined): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
		return 0;
	return Math.min(value, MAX_DWELL_MS);
}

/**
 * Вставить событие, ответив на вопрос «оно новое?».
 *
 * Нарушение уникальности здесь — не ошибка, а штатный ответ «уже записано».
 * Отличать его от настоящего сбоя обязательно: молча проглотив любую ошибку
 * записи, мы получили бы систему, которая на отказ базы отвечает «показ
 * засчитан».
 */
async function insertEvent(event: {
	bannerId: number;
	userId: number;
	impressionId: string;
	kind: BannerEventKind;
	at: Date;
	sequence: number;
	dwellMs?: number;
	closeMethod?: BannerCloseMethod;
	path?: string;
	href?: string;
}): Promise<boolean> {
	const payload = await getPayloadInstance();

	try {
		await payload.create({
			collection: "banner-events",
			data: {
				banner: event.bannerId,
				user: event.userId,
				impressionId: event.impressionId,
				kind: event.kind,
				at: event.at.toISOString(),
				sequence: event.sequence,
				dwellMs: event.dwellMs,
				closeMethod: event.closeMethod,
				path: event.path,
				href: event.href,
			},
			overrideAccess: true,
		});
		return true;
	} catch (error) {
		if (isDuplicateEvent(error)) return false;
		throw error;
	}
}

/** Колонки составного уникального индекса — так их называет Postgres. */
const IMPRESSION_KIND_INDEX_PATH = "impression_id, kind";

/**
 * Тот ли это конфликт, ради которого стоит уникальный индекс.
 *
 * ⚠ Payload НЕ ПРОПУСКАЕТ наружу ошибку Postgres `23505`: он перехватывает её и
 * отдаёт собственную `ValidationError` со статусом 400, а нарушенный индекс
 * называет в `data.errors[].path` — строкой из имён колонок. Проверка по коду
 * `23505` поэтому никогда не срабатывает, и первый же повторный запрос
 * (браузерный retry, двойной вызов эффекта в StrictMode, две вкладки) отвечал
 * пятисоткой вместо «уже записано».
 *
 * Проверка нарочно узкая — именно этот индекс, а не «любая ValidationError».
 * Широкая проглотила бы настоящие отказы валидации (пропущенное обязательное
 * поле, неизвестное значение `kind`) под видом штатного повтора, и события
 * молча перестали бы записываться — дефект, который виден только по пустеющему
 * отчёту.
 *
 * Код `23505` оставлен на случай, когда запись пойдёт мимо Payload (прямой
 * drizzle) или когда Payload перестанет оборачивать ошибку.
 */
function isDuplicateEvent(error: unknown): boolean {
	const code = (error as { code?: unknown })?.code;
	if (code === "23505" || code === 23505) return true;

	const errors = (
		error as { data?: { errors?: { path?: unknown }[] } } | undefined
	)?.data?.errors;

	return (
		Array.isArray(errors) &&
		errors.some(
			(item) =>
				typeof item?.path === "string" &&
				item.path.replace(/\s+/g, " ").trim() === IMPRESSION_KIND_INDEX_PATH,
		)
	);
}

/* ------------------------------------------------------------ состояние --- */

/**
 * Перенести последствия события в состояние показа.
 *
 * Правило успеха читается из ЖИВОГО определения баннера. Если баннер к этому
 * моменту снят с публикации, определения нет — и тогда успех не фиксируется, но
 * событие уже записано: аналитика видит, что произошло, а состояние не меняется
 * под баннер, которого больше нет.
 */
async function applyToState(params: {
	userId: number;
	bannerId: number;
	state: BannerState;
	interaction: BannerInteraction;
	dwellMs: number;
	now: Date;
}): Promise<BannerEventAck> {
	const { userId, bannerId, state, interaction, dwellMs, now } = params;

	const payload = await getPayloadInstance();
	const definition = await findLiveBanner(bannerId, now);
	const sequence = (state.impressions ?? 0) + 1;

	const ok = (outcome: boolean): BannerEventAck => ({
		accepted: true,
		allowed: true,
		revoked: false,
		outcome,
	});

	switch (interaction.kind) {
		case "impression": {
			await payload.update({
				collection: "banner-states",
				id: state.id,
				data: {
					impressions: (state.impressions ?? 0) + 1,
					lastShownAt: now.toISOString(),
					status: "active",
					// Один раз за всю жизнь пары «пользователь + баннер»: дата
					// первого показа не должна переписываться вторым.
					firstShownAt: state.firstShownAt ?? now.toISOString(),
				},
				overrideAccess: true,
			});

			return ok(false);
		}

		case "cta":
		case "link": {
			const ctaClicks =
				(state.ctaClicks ?? 0) + (interaction.kind === "cta" ? 1 : 0);

			// Нажатие кнопки может само по себе быть целью показа — и тогда
			// баннер закрывается навсегда прямо здесь, не дожидаясь события
			// закрытия. Ждать нельзя: человек ушёл по ссылке, и вкладка, которая
			// должна была прислать `dismiss`, могла не успеть.
			const reached =
				definition !== null &&
				interaction.kind === "cta" &&
				!state.outcomeReachedAt &&
				outcomeReached({
					policy: definition.policy,
					ctaClicked: true,
					dwellMs,
				});

			await payload.update({
				collection: "banner-states",
				id: state.id,
				data: {
					ctaClicks,
					...(reached
						? {
								outcomeReachedAt: now.toISOString(),
								status: "satisfied" as const,
								nextEligibleAt: null,
							}
						: {}),
				},
				overrideAccess: true,
			});

			if (reached) {
				await recordOutcome({
					bannerId,
					userId,
					interaction,
					sequence,
					now,
					dwellMs,
				});
			}

			return ok(reached);
		}

		case "view": {
			// Порог «прочитал» достигнут, а модалка ещё открыта. Фиксируем цель
			// сразу: человек, оставивший окно открытым и ушедший, прочитал
			// баннер — и повторять его назавтра было бы неверно.
			const reached =
				definition !== null &&
				!state.outcomeReachedAt &&
				outcomeReached({
					policy: definition.policy,
					ctaClicked: (state.ctaClicks ?? 0) > 0,
					dwellMs,
				});

			if (reached) {
				await payload.update({
					collection: "banner-states",
					id: state.id,
					data: {
						outcomeReachedAt: now.toISOString(),
						status: "satisfied",
						nextEligibleAt: null,
					},
					overrideAccess: true,
				});

				await recordOutcome({
					bannerId,
					userId,
					interaction,
					sequence,
					now,
					dwellMs,
				});
			}

			return ok(reached);
		}

		case "dismiss": {
			// Состояние могло измениться этим же показом (нажали кнопку, потом
			// закрыли), поэтому читается заново, а не берётся из аргумента.
			const fresh = (await payload.findByID({
				collection: "banner-states",
				id: state.id,
				depth: 0,
				overrideAccess: true,
			})) as BannerState;

			const impressions = fresh.impressions ?? 1;
			const ctaClicked = (fresh.ctaClicks ?? 0) > 0;

			// Цель могла быть засчитана раньше — по нажатию кнопки или по порогу
			// чтения при ещё открытой модалке. Тогда закрытие её не
			// пересматривает: успех — событие необратимое.
			const already = Boolean(fresh.outcomeReachedAt);
			const reached =
				already ||
				(definition !== null &&
					outcomeReached({ policy: definition.policy, ctaClicked, dwellMs }));

			const nextAt = definition
				? nextShowAt({
						policy: definition.policy,
						importance: definition.importance,
						impressions,
						outcomeReached: reached,
						now,
					})
				: null;

			await payload.update({
				collection: "banner-states",
				id: state.id,
				data: {
					totalDwellMs: (fresh.totalDwellMs ?? 0) + dwellMs,
					lastCloseMethod: interaction.closeMethod ?? "close-button",
					nextEligibleAt: nextAt?.toISOString() ?? null,
					// Баннер, которому больше некуда идти, помечается конечным
					// состоянием сразу. Иначе отбор пересчитывал бы его политику на
					// каждом проходе до скончания века — и делал бы это тем чаще,
					// чем дольше живёт аккаунт.
					status: reached
						? "satisfied"
						: nextAt === null
							? "exhausted"
							: "active",
					...(reached && !already
						? { outcomeReachedAt: now.toISOString() }
						: {}),
					// Очередь освободилась: модалка закрыта, и через паузу можно
					// показывать следующий баннер.
					inFlightSince: null,
				},
				overrideAccess: true,
			});

			if (reached && !already) {
				await recordOutcome({
					bannerId,
					userId,
					interaction,
					sequence,
					now,
					dwellMs,
				});
			}

			return ok(reached);
		}
	}
}

/**
 * Отдельное событие «цель достигнута».
 *
 * Производное, и это осознанно: правило успеха у баннера меняется, а отчёт за
 * прошлый месяц меняться вместе с ним не должен — «тогда это считалось
 * успехом». Ошибка записи не поднимается выше: состояние уже обновлено, и
 * ронять ответ пользователю ради строки в журнале незачем.
 */
async function recordOutcome(params: {
	bannerId: number;
	userId: number;
	interaction: BannerInteraction;
	sequence: number;
	now: Date;
	dwellMs: number;
}): Promise<void> {
	try {
		await insertEvent({
			bannerId: params.bannerId,
			userId: params.userId,
			impressionId: params.interaction.impressionId,
			kind: "outcome",
			at: params.now,
			sequence: params.sequence,
			dwellMs: params.dwellMs,
		});
	} catch (error) {
		console.warn(
			`[banners] Не удалось записать достижение цели баннера ${params.bannerId}:`,
			error,
		);
	}
}
