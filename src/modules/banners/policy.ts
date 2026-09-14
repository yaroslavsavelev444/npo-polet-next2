import type {
	BannerImportance,
	BannerOutcomeKind,
	BannerPolicyKind,
} from "./vocabulary.ts";

// Когда баннер можно показать ЕЩЁ РАЗ, и можно ли вообще.
//
// Чистые функции над состоянием — по той же причине, что и условия: решение о
// повторном показе это место, где легче всего случайно получить бесконечное
// преследование пользователя, и такое правило обязано проверяться таблицей, а
// не наблюдением за продом. Ни одного обращения к базе здесь нет; загрузка
// состояния — забота `server/eligibility.ts`.

/* ------------------------------------------------------------ параметры --- */

export type BannerPolicy = {
	kind: BannerPolicyKind;
	/**
	 * Через сколько часов баннер можно повторить.
	 *
	 * Читается политиками `limited`, `interval` и `until_outcome`. У `once`
	 * смысла не имеет. Не задан — действует `DEFAULT_REPEAT_HOURS`: «повторить
	 * не больше трёх раз» без указания периода это всё-таки не «три раза
	 * подряд».
	 */
	repeatAfterHours: number | null;
	/**
	 * Потолок показов. `null` — без потолка, допустимо только для `interval`
	 * (там ограничителем служит срок жизни самого баннера).
	 */
	maxImpressions: number | null;
	/** Что считать успехом. */
	outcome: BannerOutcomeKind;
	/** Порог для `dwell`: сколько секунд модалка должна провисеть открытой. */
	dwellSeconds: number;
};

/**
 * Умолчание периода повтора.
 *
 * Сутки, а не час: баннер, повторяющийся каждый час, — это определение
 * навязчивости, и администратор, не заполнивший поле, не должен получить её по
 * умолчанию. Восстановить более частый показ он может явно; отменить случайно
 * включённый — только заметив его.
 */
export const DEFAULT_REPEAT_HOURS = 24;

/**
 * Потолок повторов для важного баннера, у которого не задан свой.
 *
 * Механизм повторов не должен превращаться в бесконечное преследование. Пять
 * показов — верхняя граница, после которой повтор перестаёт быть напоминанием
 * и становится ошибкой в настройке баннера, а не средством воздействия на
 * покупателя.
 */
export const IMPORTANT_MAX_IMPRESSIONS = 5;

/**
 * Множитель отступа между повторами важного баннера.
 *
 * Каждый следующий повтор ждёт вдвое дольше предыдущего. Линейный интервал
 * («каждые шесть часов») одинаково настойчив на втором показе и на пятом, а
 * пользователь к пятому уже ответил — молчанием. Удвоение сохраняет
 * настойчивость там, где она уместна, и гасит её там, где нет.
 */
export const IMPORTANT_BACKOFF_FACTOR = 2;

/** Верхняя граница отступа: дальше удваивать бессмысленно. */
export const MAX_BACKOFF_HOURS = 14 * 24;

/* ------------------------------------------------------------ состояние --- */

export type BannerShowState = {
	impressions: number;
	lastShownAt: Date | null;
	/** Достигнут ли успех по критерию показа. */
	outcomeReachedAt: Date | null;
	/**
	 * Явно назначенное время следующего показа.
	 *
	 * Считается при закрытии и хранится, а не пересчитывается на каждом
	 * проходе. Хранение выигрывает потому, что правило может измениться:
	 * администратор поменял интервал, а уже назначенный пользователю момент не
	 * должен от этого прыгать назад — иначе редактирование баннера немедленно
	 * выплёскивает его всем, кто ждал повтора.
	 */
	nextEligibleAt: Date | null;
};

export type PolicyDecision =
	| { showable: true }
	| {
			showable: false;
			/** Машинно-читаемая причина: попадает в лог решения. */
			reason: "outcome-reached" | "impressions-exhausted" | "waiting-interval";
			/** Когда станет можно; `null` — уже никогда. */
			nextEligibleAt: Date | null;
	  };

/**
 * Эффективный потолок показов.
 *
 * Важный баннер без явного потолка получает `IMPORTANT_MAX_IMPRESSIONS`, а не
 * бесконечность: «повторять до результата» без верхней границы — это и есть
 * преследование, и полагаться на то, что администратор не забудет заполнить
 * поле, здесь нельзя.
 */
export function effectiveMaxImpressions(
	policy: BannerPolicy,
	importance: BannerImportance,
): number | null {
	if (policy.kind === "once") return 1;
	if (policy.maxImpressions !== null) return policy.maxImpressions;
	if (policy.kind === "until_outcome") return IMPORTANT_MAX_IMPRESSIONS;
	return importance === "important" ? IMPORTANT_MAX_IMPRESSIONS : null;
}

/**
 * Можно ли показать баннер этому пользователю прямо сейчас.
 *
 * Порядок проверок — от необратимого к временному, чтобы причина в логе была
 * самой содержательной из подходящих: «цель достигнута» объясняет больше, чем
 * «ждём интервал», даже когда верны обе.
 */
export function decideShow(params: {
	policy: BannerPolicy;
	importance: BannerImportance;
	state: BannerShowState;
	now: Date;
}): PolicyDecision {
	const { policy, importance, state, now } = params;

	// Успех закрывает баннер для любой политики, а не только для
	// `until_outcome`. Показывать «Оцените покупку» тому, кто уже перешёл к
	// форме отзыва, незачем ни при какой настройке.
	if (state.outcomeReachedAt) {
		return { showable: false, reason: "outcome-reached", nextEligibleAt: null };
	}

	const max = effectiveMaxImpressions(policy, importance);

	if (max !== null && state.impressions >= max) {
		return {
			showable: false,
			reason: "impressions-exhausted",
			nextEligibleAt: null,
		};
	}

	if (state.nextEligibleAt && state.nextEligibleAt > now) {
		return {
			showable: false,
			reason: "waiting-interval",
			nextEligibleAt: state.nextEligibleAt,
		};
	}

	return { showable: true };
}

/**
 * Когда показать снова после закрытия без успеха.
 *
 * `null` означает «больше никогда» и возвращается ровно тогда, когда это
 * решено: политика однократная, потолок исчерпан или цель достигнута.
 *
 * Отступ считается от ЧИСЛА УЖЕ СОСТОЯВШИХСЯ ПОКАЗОВ, а не от предыдущего
 * отступа: состояние тогда остаётся восстановимым из одного счётчика, и
 * потерянное `nextEligibleAt` не сбрасывает выдержку в начало.
 */
export function nextShowAt(params: {
	policy: BannerPolicy;
	importance: BannerImportance;
	/** Число показов ПОСЛЕ только что закрытого. */
	impressions: number;
	outcomeReached: boolean;
	now: Date;
}): Date | null {
	const { policy, importance, impressions, outcomeReached, now } = params;

	if (outcomeReached) return null;
	if (policy.kind === "once") return null;

	const max = effectiveMaxImpressions(policy, importance);
	if (max !== null && impressions >= max) return null;

	const base = policy.repeatAfterHours ?? DEFAULT_REPEAT_HOURS;

	// Экспоненциальная выдержка — только у важных: у обычного баннера повтор и
	// так редкий, а растущий интервал сделал бы его расписание непредсказуемым
	// для администратора, который задал «раз в сутки» и вправе это получить.
	const hours =
		importance === "important"
			? Math.min(
					base * IMPORTANT_BACKOFF_FACTOR ** Math.max(0, impressions - 1),
					MAX_BACKOFF_HOURS,
				)
			: base;

	return new Date(now.getTime() + hours * 3_600_000);
}

/**
 * Достигнута ли цель показа.
 *
 * `dwellMs` — время от открытия модалки до события. Считает браузер (только он
 * знает момент открытия), сервер ограничивает значение сверху — см.
 * `server/events.ts`.
 */
export function outcomeReached(params: {
	policy: BannerPolicy;
	ctaClicked: boolean;
	dwellMs: number;
}): boolean {
	const { policy, ctaClicked, dwellMs } = params;
	const dwelled = dwellMs >= policy.dwellSeconds * 1000;

	switch (policy.outcome) {
		case "cta":
			return ctaClicked;
		case "dwell":
			return dwelled;
		case "cta_or_dwell":
			return ctaClicked || dwelled;
	}
}

/* --------------------------------------------------------- темп показов --- */

/**
 * Пауза между двумя баннерами подряд.
 *
 * Два модальных окна подряд читаются как сбой интерфейса, а не как два
 * сообщения. Значение общее для всех баннеров: «важный» получает право пройти
 * раньше остальных в очереди, но не право нарушить паузу — иначе достаточно
 * пометить важными три баннера, чтобы вернуться ровно к тому, от чего пауза
 * защищает.
 */
export const BANNER_COOLDOWN_MINUTES = 5;
export const BANNER_COOLDOWN_MS = BANNER_COOLDOWN_MINUTES * 60_000;

/**
 * Сколько баннеров человек может увидеть за сутки.
 *
 * Ограничение поверх паузы, и оно нужно отдельно: пятиминутная пауза за день
 * активной работы разрешает почти три сотни показов. Три — верхняя граница, за
 * которой баннеры перестают восприниматься по одному и превращаются в фон,
 * который закрывают не читая.
 */
export const BANNER_DAILY_LIMIT = 3;

/**
 * Задержка перед самым первым баннером сессии.
 *
 * Модалка, встречающая посетителя на первом кадре, — это то самое «экранное
 * время», которого у него ещё не было: он не успел понять, куда попал, и
 * закрывает окно рефлекторно. Полторы минуты дают человеку осмотреться и
 * заметно поднимают долю осознанных закрытий вместо рефлекторных.
 *
 * У конкретного баннера может быть собственная задержка (`delaySeconds`);
 * действует большая из двух.
 */
export const SESSION_WARMUP_SECONDS = 90;

/**
 * Сколько живёт «баннер в полёте» — выданный, но не закрытый показ.
 *
 * Пока он держится, следующий баннер не выдаётся. Полчаса — срок, после
 * которого вкладка с невыполненным показом считается потерянной (закрыли
 * браузер, уснул ноутбук), и очередь пользователя не должна стоять из-за неё
 * вечно.
 */
export const BANNER_IN_FLIGHT_MS = 30 * 60_000;
