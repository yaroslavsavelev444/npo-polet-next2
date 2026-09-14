import { getPayloadInstance } from "@/payload/services/getPayload";
import type { BannerState } from "@/payload-types";
import type { BannerAudienceFacts, BannerClientContext } from "../conditions";
import { bannerWeight, evaluateConditions } from "../conditions";
import type { BannerShowState } from "../policy";
import { decideShow } from "../policy";
import { type BannerDefinition, listLiveBanners } from "./definitions";
import { collectAudienceFacts } from "./facts";

// Кому какой баннер положен и в каком порядке.
//
// Слой отбора не знает ни о транспорте, ни о Payload-хуках, ни о React: на
// вход — пользователь, его страница и момент времени, на выход —
// упорядоченный список кандидатов и причина отказа для каждого отсеянного.
// Выдача (`delivery.ts`) берёт первого; темп показов и запись событий — её
// забота, не эта.
//
// Такое разделение стоит одного лишнего типа и окупается в первый же день
// эксплуатации: вопрос «почему человеку не показался баннер» имеет здесь
// прямой ответ, не требующий ни воспроизведения, ни отладки в браузере.

export type BannerRejection = {
	bannerId: number;
	reason:
		| "conditions"
		| "wrong-page"
		| "outcome-reached"
		| "impressions-exhausted"
		| "waiting-interval";
	nextEligibleAt: Date | null;
};

export type BannerCandidate = {
	definition: BannerDefinition;
	state: BannerState | null;
	/** Чем больше, тем раньше в очереди. */
	weight: number;
};

export type EligibilityResult = {
	/** Отсортированы: важные впереди, внутри важности — по приоритету. */
	candidates: BannerCandidate[];
	rejected: BannerRejection[];
	/**
	 * `null` означает «этому пользователю баннеры не положены вовсе» —
	 * заблокирован, приостановлен, удалён. Не то же самое, что пустой список
	 * кандидатов.
	 */
	facts: BannerAudienceFacts | null;
	/**
	 * Ближайший момент, когда кто-то из отсеянных по интервалу снова станет
	 * доступен. Клиенту он уходит как `retryAt` — иначе баннер с политикой «раз
	 * в сутки» ждал бы не суток, а следующей перезагрузки страницы.
	 */
	nextWakeUpAt: Date | null;
};

/**
 * Отобрать баннеры для одного пользователя.
 *
 * Порядок проверок — от дешёвого к дорогому и от общего к частному: сначала
 * живые определения (кэш), потом факты (один запрос на пользователя, один раз
 * на весь проход), потом состояния (один запрос на все баннеры сразу) и только
 * потом правила. Обратный порядок означал бы сбор фактов ради пользователя,
 * которому вообще нечего показывать.
 */
export async function selectBannersForUser(params: {
	userId: number;
	/** Где сейчас вкладка. `null` — неизвестно, условия `page` не выполнятся. */
	context: BannerClientContext | null;
	now?: Date;
}): Promise<EligibilityResult> {
	const now = params.now ?? new Date();

	const definitions = await listLiveBanners(now);

	if (definitions.length === 0) {
		return { candidates: [], rejected: [], facts: null, nextWakeUpAt: null };
	}

	const facts = await collectAudienceFacts(params.userId, now);

	if (!facts) {
		return { candidates: [], rejected: [], facts: null, nextWakeUpAt: null };
	}

	const stateById = await loadStates(
		params.userId,
		definitions.map((definition) => definition.id),
	);

	const candidates: BannerCandidate[] = [];
	const rejected: BannerRejection[] = [];
	let nextWakeUpAt: Date | null = null;

	for (const definition of definitions) {
		const conditions = evaluateConditions({
			conditions: definition.conditions,
			match: definition.conditionMatch,
			facts,
			context: params.context,
		});

		if (!conditions.matched) {
			// «Не тот экран» и «не тот человек» разведены не ради красоты лога:
			// первое означает «вернуться, когда перейдёт», второе — «забыть до
			// изменения фактов».
			rejected.push({
				bannerId: definition.id,
				reason: conditions.blockedByPage ? "wrong-page" : "conditions",
				nextEligibleAt: null,
			});
			continue;
		}

		const state = stateById.get(definition.id) ?? null;

		const decision = decideShow({
			policy: definition.policy,
			importance: definition.importance,
			state: toShowState(state),
			now,
		});

		if (!decision.showable) {
			rejected.push({
				bannerId: definition.id,
				reason: decision.reason,
				nextEligibleAt: decision.nextEligibleAt,
			});

			if (
				decision.nextEligibleAt &&
				(!nextWakeUpAt || decision.nextEligibleAt < nextWakeUpAt)
			) {
				nextWakeUpAt = decision.nextEligibleAt;
			}
			continue;
		}

		candidates.push({
			definition,
			state,
			weight: bannerWeight(definition.importance, definition.priority),
		});
	}

	candidates.sort(compareCandidates);

	return { candidates, rejected, facts, nextWakeUpAt };
}

/**
 * Состояния по всем баннерам сразу — одним запросом.
 *
 * По одному на баннер это N запросов на каждый заход пользователя, и все по
 * одному и тому же индексу.
 */
async function loadStates(
	userId: number,
	bannerIds: number[],
): Promise<Map<number, BannerState>> {
	const payload = await getPayloadInstance();

	const result = await payload.find({
		collection: "banner-states",
		where: {
			and: [{ user: { equals: userId } }, { banner: { in: bannerIds } }],
		},
		limit: bannerIds.length,
		depth: 0,
		overrideAccess: true,
	});

	return new Map(
		result.docs.map((state) => [
			// `depth: 0` отдаёт связь идентификатором, но тип по-прежнему
			// допускает развёрнутый документ — сузить обязан читатель.
			typeof state.banner === "object" ? state.banner.id : state.banner,
			state,
		]),
	);
}

/**
 * Порядок в очереди.
 *
 * Вес (важность + приоритет) решает первым. При равном весе вперёд идёт
 * баннер, опубликованный РАНЬШЕ: иначе новый баннер с тем же приоритетом вечно
 * обгонял бы старый, и старый не показался бы никогда — очередь без такого
 * правила не является очередью.
 */
function compareCandidates(a: BannerCandidate, b: BannerCandidate): number {
	if (a.weight !== b.weight) return b.weight - a.weight;
	return a.definition.publishAt.getTime() - b.definition.publishAt.getTime();
}

/** Состояние из базы → то, что читает политика. Отсутствие записи — нули. */
export function toShowState(state: BannerState | null): BannerShowState {
	return {
		impressions: state?.impressions ?? 0,
		lastShownAt: toDate(state?.lastShownAt),
		outcomeReachedAt: toDate(state?.outcomeReachedAt),
		nextEligibleAt: toDate(state?.nextEligibleAt),
	};
}

function toDate(value: string | null | undefined): Date | null {
	return value ? new Date(value) : null;
}

/**
 * Проверить один конкретный баннер для одного пользователя — заново и с нуля.
 *
 * ЭТО ФУНКЦИЯ-СТРАЖ, А НЕ ОПТИМИЗАЦИЯ. Её вызывает запись событий: между
 * выдачей и приходом события «показан» проходит время, за которое
 * администратор мог снять баннер с публикации, а пользователь — потерять право
 * его видеть (например, оформив заказ, отсутствие которого и было условием).
 * Без повторной проверки браузер мог бы предъявить любой идентификатор и
 * получить запись показа для баннера, который ему не положен.
 */
export async function verifyBannerForUser(params: {
	userId: number;
	bannerId: number;
	context: BannerClientContext | null;
	now?: Date;
}): Promise<BannerDefinition | null> {
	const result = await selectBannersForUser({
		userId: params.userId,
		context: params.context,
		now: params.now,
	});

	return (
		result.candidates.find(
			(candidate) => candidate.definition.id === params.bannerId,
		)?.definition ?? null
	);
}
