import { unstable_cache } from "next/cache";
import { getPayloadInstance } from "@/payload/services/getPayload";
import type { Banner, Media } from "@/payload-types";
import type {
	BannerCondition,
	BannerConditionMatch,
	NumericRange,
} from "../conditions";
import type { BannerPolicy } from "../policy";
import type {
	BannerImageMode,
	BannerImportance,
	BannerLinkKind,
} from "../vocabulary";
import { isSafeBannerHref } from "../vocabulary";

// Определения баннеров: чтение из Payload и перевод в доменную форму.
//
// ─── Зачем перевод, если Payload уже отдаёт типы ───────────────────────────
//
// Сгенерированный `Banner` описывает ФОРМУ АДМИНКИ, а не предметную область:
// почти каждое поле в нём необязательно (`string | null`), диапазон разложен на
// пары полей рядом с прочими полями блока, а тип блока называется `blockType`.
// Работать с ним в движке отбора значило бы на каждом обращении отвечать на
// вопрос «а что если не заполнено», причём в каждом месте по-своему. Перевод
// отвечает на него один раз и отдаёт дальше структуру, у которой нет
// невозможных состояний.
//
// Здесь же проходит ВТОРАЯ ПРОВЕРКА ССЫЛОК. Первая стоит в валидации поля
// (подсказка администратору), эта — гарантия: документ мог быть создан
// скриптом, импортирован или сохранён до появления правила, а цена ошибки —
// `javascript:`-ссылка в модалке, которую показали мы сами.
//
// ─── Кэш ───────────────────────────────────────────────────────────────────
//
// Next Data Cache с тегом `banners` — тот же механизм, что у остальных
// сервисов проекта (`categories.service.ts`, `settings.service.ts`), и
// инвалидируется он тем же хуком коллекции. Здесь он уместен ровно потому,
// почему неуместен в уведомлениях: список баннеров ОБЩИЙ ДЛЯ ВСЕХ и меняется
// раз в неделю, а читается на каждый заход авторизованного покупателя.
//
// ⚠ Кэшируются документы БЕЗ ФИЛЬТРАЦИИ ПО ВРЕМЕНИ, а окна `publishAt`,
// `startAt` и `endAt` проверяются уже над кэшем. Иначе кэш с `revalidate:
// false` запомнил бы ответ «этот баннер ещё не созрел» навсегда, и
// пятнадцатиминутное окно никогда бы не истекало — баннер ждал бы не проверки,
// а следующей правки в админке. Список маленький (десятки документов), так что
// фильтрация в памяти ничего не стоит.

/** Верхняя граница выборки. Больше сотни живых баннеров — это авария, не настройка. */
const MAX_LIVE_BANNERS = 100;

export type BannerLink = {
	label: string;
	href: string;
	kind: BannerLinkKind;
};

/**
 * Баннер в доменной форме — то, чем оперируют отбор, выдача и аналитика.
 *
 * Отличия от документа Payload, и каждое неслучайно: нет необязательных полей
 * там, где значение по смыслу обязано быть; условия — размеченное объединение
 * `BannerCondition`; политика собрана в один объект вместе с умолчаниями.
 */
export type BannerDefinition = {
	id: number;
	title: string;
	body: string | null;
	image: {
		url: string;
		alt: string;
		width: number | null;
		height: number | null;
		mode: BannerImageMode;
	} | null;
	cta: BannerLink | null;
	link: BannerLink | null;
	conditions: BannerCondition[];
	conditionMatch: BannerConditionMatch;
	importance: BannerImportance;
	priority: number;
	delaySeconds: number;
	policy: BannerPolicy;
	publishAt: Date;
	startAt: Date | null;
	endAt: Date | null;
};

/**
 * Все баннеры, которые администратор намерен показывать.
 *
 * «Намерен» — это `status: scheduled`; черновики, пауза и архив отсекаются
 * здесь и в отбор не попадают никогда. Созрел ли баннер по времени, решает
 * `listLiveBanners` ниже — см. предупреждение в шапке про кэш.
 */
async function fetchScheduledBanners(): Promise<BannerDefinition[]> {
	const payload = await getPayloadInstance();

	const result = await payload.find({
		collection: "banners",
		where: { status: { equals: "scheduled" } },
		// depth: 1 — ради картинки: изображение хранится связью на `media`, и без
		// разворота пришлось бы делать второй запрос на каждый баннер.
		depth: 1,
		limit: MAX_LIVE_BANNERS,
		sort: "-priority",
		overrideAccess: true,
	});

	if (result.totalDocs > MAX_LIVE_BANNERS) {
		// Молча обрезанная выборка выглядит как «баннер не показывается» и
		// расследуется часами. Отсечка по приоритету при этом верная — просто о
		// ней надо знать.
		console.warn(
			`[banners] Живых баннеров ${result.totalDocs} при пределе выборки ${MAX_LIVE_BANNERS} — часть не участвует в отборе`,
		);
	}

	return result.docs
		.map((doc) => toDefinition(doc))
		.filter((banner): banner is BannerDefinition => banner !== null);
}

/**
 * Кэшированное чтение.
 *
 * В development кэш обходится — как и во всех остальных сервисах проекта:
 * редактор, правящий баннер в админке, должен видеть результат сразу, а не
 * после инвалидации тега.
 *
 * `unstable_cache` сериализует результат в JSON, поэтому `Date` из него
 * возвращаются строками. Восстановление — в `listLiveBanners`: доверять
 * объявленному типу здесь нельзя, и молчаливое `banner.publishAt > now` над
 * строкой дало бы сравнение строки с датой, то есть всегда `false`.
 */
const readScheduledBanners =
	process.env.NODE_ENV === "development"
		? fetchScheduledBanners
		: unstable_cache(fetchScheduledBanners, ["banners-scheduled"], {
				tags: ["banners"],
				revalidate: false,
			});

function reviveDates(banner: BannerDefinition): BannerDefinition {
	return {
		...banner,
		publishAt: new Date(banner.publishAt),
		startAt: banner.startAt ? new Date(banner.startAt) : null,
		endAt: banner.endAt ? new Date(banner.endAt) : null,
	};
}

/**
 * Живые баннеры: намеченные к показу, прошедшие окно проверки и попавшие в своё
 * окно показа.
 *
 * ЭТО ЕДИНСТВЕННАЯ ТОЧКА, ЧЕРЕЗ КОТОРУЮ БАННЕР ПОПАДАЕТ К ПОЛЬЗОВАТЕЛЮ. Ни
 * один вызывающий не вправе решать самостоятельно, опубликован ли баннер:
 * защита от показа отключённых, удалённых и ещё не проверенных работает только
 * тогда, когда её невозможно обойти по невнимательности.
 */
export async function listLiveBanners(
	now: Date = new Date(),
): Promise<BannerDefinition[]> {
	const banners = await readScheduledBanners();

	return banners
		.map(reviveDates)
		.filter((banner) => isWithinWindow(banner, now));
}

/** Один баннер по идентификатору, с теми же проверками жизненного цикла. */
export async function findLiveBanner(
	bannerId: number,
	now: Date = new Date(),
): Promise<BannerDefinition | null> {
	const banners = await listLiveBanners(now);
	return banners.find((banner) => banner.id === bannerId) ?? null;
}

function isWithinWindow(banner: BannerDefinition, now: Date): boolean {
	if (banner.publishAt > now) return false;
	if (banner.startAt && banner.startAt > now) return false;
	if (banner.endAt && banner.endAt <= now) return false;
	return true;
}

/* ------------------------------------------------------------- перевод --- */

function toDefinition(doc: Banner): BannerDefinition | null {
	// Баннер без `publishAt` невозможен — хук коллекции проставляет его при
	// любом переходе к публикации, — но документ мог прийти из импорта. Отказ
	// здесь безопаснее умолчания: «показать немедленно» и «не показывать» —
	// разные ошибки, и вторая обратима.
	if (!doc.publishAt) {
		console.warn(
			`[banners] Баннер ${doc.id} помечен к показу, но без даты публикации — пропущен`,
		);
		return null;
	}

	const image =
		typeof doc.content?.image === "object" ? doc.content.image : null;

	return {
		id: doc.id,
		title: doc.content.title,
		body: doc.content.body?.trim() || null,
		image: toImage(image, doc.content.imageMode),
		cta: toLink(doc.cta, doc.id, "cta"),
		link: toLink(doc.link, doc.id, "link"),
		conditions: toConditions(doc.conditions),
		conditionMatch: doc.conditionMatch,
		importance: doc.importance ?? "normal",
		priority: doc.priority ?? 0,
		delaySeconds: Math.max(0, doc.delaySeconds ?? 0),
		policy: toPolicy(doc.policy),
		publishAt: new Date(doc.publishAt),
		startAt: doc.startAt ? new Date(doc.startAt) : null,
		endAt: doc.endAt ? new Date(doc.endAt) : null,
	};
}

function toImage(
	media: Media | null,
	mode: Banner["content"]["imageMode"],
): BannerDefinition["image"] {
	if (!media?.url) return null;

	return {
		url: media.url,
		// Пустая альтернатива лучше строки «изображение»: скринридер молча
		// пропустит декоративную картинку вместо того, чтобы зачитывать слово, не
		// несущее смысла.
		alt: media.alt ?? "",
		width: media.width ?? null,
		height: media.height ?? null,
		mode: mode ?? "post",
	};
}

function toLink(
	group: Banner["cta"] | Banner["link"],
	bannerId: number,
	which: "cta" | "link",
): BannerLink | null {
	if (!group?.enabled) return null;

	const label = group.label?.trim();
	const href = group.href?.trim();
	const kind: BannerLinkKind =
		group.kind === "external" ? "external" : "internal";

	if (!label || !href) return null;

	if (!isSafeBannerHref(kind, href)) {
		// Баннер при этом остаётся живым, но без кнопки: показать текст без
		// действия — меньшее зло, чем не показать ничего, и куда меньшее, чем
		// поставить пользователю ссылку, которую мы сами считаем небезопасной.
		console.error(
			`[banners] Небезопасный адрес в баннере ${bannerId} (${which}, ${kind}): ${href} — ссылка снята с показа`,
		);
		return null;
	}

	return { label, href, kind };
}

function toPolicy(policy: Banner["policy"]): BannerPolicy {
	return {
		kind: policy?.kind ?? "once",
		repeatAfterHours: policy?.repeatAfterHours ?? null,
		maxImpressions: policy?.maxImpressions ?? null,
		outcome: policy?.outcome ?? "cta_or_dwell",
		dwellSeconds: policy?.dwellSeconds ?? 5,
	};
}

function range(min: unknown, max: unknown): NumericRange {
	return {
		min: typeof min === "number" ? min : null,
		max: typeof max === "number" ? max : null,
	};
}

/**
 * Блоки Payload → размеченное объединение `BannerCondition`.
 *
 * `switch` по `blockType` с полным перебором: добавленный в коллекцию блок, для
 * которого забыли ветку здесь, даёт ошибку компиляции в `default` (переменная
 * там сужается до `never`), а не молча игнорируемое условие. Молча
 * игнорируемое условие — это баннер, показанный не тем людям, и заметить его
 * можно только по жалобе.
 */
function toConditions(blocks: Banner["conditions"]): BannerCondition[] {
	if (!blocks) return [];

	const conditions: BannerCondition[] = [];

	for (const block of blocks) {
		switch (block.blockType) {
			case "account-age":
				conditions.push({
					kind: "account-age",
					days: range(block.minDays, block.maxDays),
				});
				break;
			case "email-verified":
				conditions.push({
					kind: "email-verified",
					verified: block.verified === true,
				});
				break;
			case "order-count":
				conditions.push({
					kind: "order-count",
					scope: block.scope,
					count: range(block.minCount, block.maxCount),
					// Вопрос «когда был последний заказ» задан только для «любых»:
					// у доставленных и у заказов в работе свои даты, и отвечать на
					// него тем же полем значило бы отвечать не на тот вопрос.
					...(block.scope === "any"
						? {
								daysSinceLast: range(
									block.minDaysSinceLast,
									block.maxDaysSinceLast,
								),
							}
						: {}),
				});
				break;
			case "cart":
				conditions.push({
					kind: "cart",
					state: block.state,
					...(block.state === "filled"
						? {
								items: range(block.minItems, block.maxItems),
								total: range(block.minTotal, block.maxTotal),
								idleHours: range(block.minIdleHours, block.maxIdleHours),
							}
						: {}),
				});
				break;
			case "wishlist":
				conditions.push({
					kind: "wishlist",
					items: range(block.minItems, block.maxItems),
				});
				break;
			case "pending-reviews":
				conditions.push({
					kind: "pending-reviews",
					count: range(block.minCount, block.maxCount),
				});
				break;
			case "action":
				conditions.push({
					kind: "action",
					action: block.action,
					performed: block.performed !== false,
					withinDays: block.withinDays ?? null,
				});
				break;
			case "page":
				conditions.push({ kind: "page", paths: block.paths });
				break;
			default: {
				const unreachable: never = block;
				console.error(
					`[banners] Неизвестный тип условия — условие проигнорировано: ${JSON.stringify(unreachable)}`,
				);
			}
		}
	}

	return conditions;
}
