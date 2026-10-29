import type { Consent } from "@/payload-types";
import { SITE_TIME_ZONE } from "@/shared/lib/time-zone";
import {
	type ParsedConsent,
	parseConsent,
	parseRussianDate,
} from "./parseConsent";

/**
 * Что о документе нужно знать до того, как его открыть: какая редакция и с
 * какого дня она действует.
 *
 * Даты берутся из шапки самого документа, а не из служебных полей Payload:
 * updatedAt меняется от любого сохранения в админке (даже исправления
 * опечатки в slug), а юридическое значение имеет дата вступления в силу,
 * которую пишет юрист. Служебная дата — только запасной вариант для
 * документа без шапки.
 */
export interface ConsentSummary {
	slug: string;
	title: string;
	needsAcceptance: boolean;
	edition: string | null;
	/** Готовая к показу строка о действии документа. */
	status: string;
	/** Редакция опубликована, но ещё не вступила в силу. */
	upcoming: boolean;
	parsed: ParsedConsent;
}

export function formatServiceDate(iso: string | null | undefined) {
	if (!iso) return null;
	return (
		new Date(iso)
			.toLocaleDateString("ru-RU", {
				timeZone: SITE_TIME_ZONE,
				day: "numeric",
				month: "long",
				year: "numeric",
			})
			// «11 октября 2026 г.» → «11 октября 2026»: так же, как даты из
			// шапок документов рядом.
			.replace(/\s*г\.$/, "")
	);
}

export function summarizeConsent(
	consent: Consent,
	now: Date = new Date(),
): ConsentSummary {
	const parsed = parseConsent(consent.content ?? "", consent.title);
	const effectiveDate = parseRussianDate(parsed.effective);
	const upcoming = effectiveDate !== null && effectiveDate > now;

	let status: string;
	if (parsed.effective) {
		status = upcoming
			? `Вступает в силу ${parsed.effective}`
			: `Действует с ${parsed.effective}`;
	} else if (parsed.published) {
		status = `Опубликован ${parsed.published}`;
	} else {
		const updated = formatServiceDate(
			consent.lastUpdatedAt ?? consent.updatedAt,
		);
		status = updated ? `Обновлён ${updated}` : "";
	}

	return {
		slug: consent.slug,
		title: consent.title,
		needsAcceptance: consent.needsAcceptance !== false,
		edition: parsed.edition,
		status,
		upcoming,
		parsed,
	};
}

/**
 * Порядок перечня: сначала то, что принимают при регистрации, внутри — по
 * алфавиту. Поле сортировки в коллекции нет, а прежний порядок «по версии»
 * (строкой) менялся от каждой правки текста.
 */
export function byAcceptanceThenTitle(a: ConsentSummary, b: ConsentSummary) {
	if (a.needsAcceptance !== b.needsAcceptance)
		return a.needsAcceptance ? -1 : 1;
	return a.title.localeCompare(b.title, "ru");
}
