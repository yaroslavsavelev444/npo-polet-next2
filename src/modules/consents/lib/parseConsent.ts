/**
 * Разбор текста соглашения на структуру.
 *
 * Тексты документов хранятся в Payload простым textarea: юрист вставляет их
 * из Word, и разметки там нет — ни заголовков, ни списков, часто даже пустых
 * строк между абзацами. Раньше страница показывала это одной стеной текста
 * с white-space: pre-line, и найти «раздел 7», на который ссылается соседний
 * пункт, можно было только поиском браузера.
 *
 * Структура при этом в тексте есть — её просто нужно прочитать:
 *   • шапка: «Дата публикации: …», «Дата вступления в силу: …»,
 *     «Редакция № N» / «Версия: N» — первыми строками или одной строкой;
 *   • разделы: «7. Срок действия Согласия»;
 *   • пункты: «7.1. …», подпункты «7.1.2. …»;
 *   • списки: строки с «•», «–», «—»;
 *   • записи: «• Название: _ym_uid» и следом строки «Цель: …», «Срок
 *     хранения: …» — так в документе о cookie записан перечень cookie.
 *
 * Правила выведены из шести опубликованных документов и намеренно
 * осторожные: всё, что не опознано уверенно, остаётся обычным абзацем.
 * Ошибка в эту сторону стоит некрасивого абзаца, в обратную — выдуманного
 * раздела в оглавлении.
 */

export interface ConsentSection {
	id: string;
	number: string;
	title: string;
}

export type ConsentBlock =
	| ({ type: "section" } & ConsentSection)
	| { type: "subsection"; number: string; title: string }
	| { type: "clause"; number: string; text: string }
	| { type: "list"; items: string[] }
	| { type: "record"; fields: Array<{ label: string; value: string }> }
	| { type: "paragraph"; text: string };

export interface ParsedConsent {
	/** Полное наименование документа из шапки, если оно отличается от заголовка. */
	fullTitle: string | null;
	published: string | null;
	effective: string | null;
	/** «Редакция № 3» или «Версия 2.3» — так, как это называет сам документ. */
	edition: string | null;
	sections: ConsentSection[];
	blocks: ConsentBlock[];
}

const META_KEY = /Дата публикации|Дата вступления в силу|Редакция\s*№|Версия:/i;
const HEAD_SCAN_LIMIT = 6;
const HEAD_LINE_MAX = 220;

/** Заголовок раздела длиннее этого — уже не заголовок, а нумерованный абзац. */
const SECTION_TITLE_MAX = 100;
/** Пункт короче и без точки в конце читается как подзаголовок: «5.1. Строго необходимые cookie». */
const SUBSECTION_TITLE_MAX = 70;
/**
 * Насколько номер раздела может «перепрыгнуть» предыдущий. В пользовательском
 * соглашении часть заголовков слиплась с соседними строками при вставке, и за
 * «2.» сразу идёт «4.»; при строгой последовательности оглавление потеряло бы
 * хвост документа. Нумерованные шаги внутри раздела («1. Через настройки
 * браузера» под разделом 8) этим же правилом отсекаются: номер ниже текущего.
 */
const SECTION_JUMP_MAX = 3;

function normalizeLine(line: string): string {
	return line
		.replace(/\t/g, " ")
		.replace(/\s{2,}/g, " ")
		.trim();
}

function cleanDate(value: string): string {
	return value
		.replace(/[\s.,]+$/, "")
		.replace(/\s+(года|г)$/i, "")
		.trim();
}

function matchMeta(line: string, pattern: RegExp): string | null {
	const match = line.match(pattern);
	return match?.[1] ? cleanDate(match[1]) : null;
}

const STOP = String.raw`(?=\s*[.,]?\s*(?:Дата публикации|Дата вступления|Редакция|Версия)|\s*\.?\s*$)`;
const PUBLISHED = new RegExp(String.raw`Дата публикации:\s*(.+?)${STOP}`, "i");
const EFFECTIVE = new RegExp(
	String.raw`Дата вступления в силу:\s*(.+?)${STOP}`,
	"i",
);

function comparable(value: string): string {
	return value
		.toLowerCase()
		.replace(/[«»"„“”()]/g, "")
		.replace(/ё/g, "е")
		.replace(/\s+/g, " ")
		.trim();
}

interface Head {
	fullTitle: string | null;
	published: string | null;
	effective: string | null;
	edition: string | null;
	consumed: number;
}

function parseHead(lines: string[], title: string): Head {
	const empty: Head = {
		fullTitle: null,
		published: null,
		effective: null,
		edition: null,
		consumed: 0,
	};

	const scan = lines.slice(0, HEAD_SCAN_LIMIT);
	const metaIndexes = scan
		.map((line, index) => (META_KEY.test(line) ? index : -1))
		.filter((index) => index >= 0);
	if (metaIndexes.length === 0) return empty;

	// Шапка — это строки до последней строки с реквизитами редакции, и только
	// если между ними нет обычного текста (он длинный).
	const last = metaIndexes[metaIndexes.length - 1];
	const head = scan.slice(0, last + 1);
	if (head.some((line) => line.length > HEAD_LINE_MAX)) return empty;

	const titleParts: string[] = [];
	const metaText: string[] = [];

	for (const line of head) {
		const at = line.search(META_KEY);
		if (at < 0) {
			titleParts.push(line);
			continue;
		}
		// «Пользовательское соглашение (…) Дата публикации: …» — наименование
		// и реквизиты слиплись в одну строку.
		if (at > 0) titleParts.push(line.slice(0, at).trim());
		metaText.push(line.slice(at));
	}

	const meta = metaText.join(" ");
	const editionNumber = meta.match(/Редакция\s*№\s*(\d+)/i)?.[1];
	const versionNumber = meta.match(/Версия:?\s*(\d+(?:\.\d+)*)/i)?.[1];

	// Строка, повторяющая заголовок страницы, — тот же заголовок ещё раз
	// (часто капслоком). Всё остальное — уточнение, и оно остаётся.
	const fullTitle = titleParts
		.filter((part) => comparable(part) !== comparable(title))
		// «(условия оплаты, доставки и возврата)» — уточнение в скобках под
		// заголовком; без заголовка рядом скобки уже ничего не уточняют.
		.map((part) => part.replace(/^\((.*)\)$/, "$1").replace(/[.\s]+$/, ""))
		.filter(Boolean)
		.map((part) => part[0].toUpperCase() + part.slice(1))
		.join(". ")
		.trim();

	return {
		fullTitle: fullTitle || null,
		published: matchMeta(meta, PUBLISHED),
		effective: matchMeta(meta, EFFECTIVE),
		edition: editionNumber
			? `Редакция № ${editionNumber}`
			: versionNumber
				? `Версия ${versionNumber}`
				: null,
		consumed: head.length,
	};
}

const SECTION_LINE = /^(\d{1,2})\.\s+(\S.*)$/;
const CLAUSE_LINE = /^(\d{1,2}(?:\.\d{1,2})+)\.?\s+(\S.*)$/;
const BULLET_LINE = /^[•·▪●◦–—-]\s*(\S.*)$/;
/** «Срок хранения: 7 дней» — короткая подпись с двоеточием и значение. */
const FIELD_LINE = /^([А-ЯЁA-Z][^:.;]{1,30}):\s+(\S.*)$/;

export function parseConsent(content: string, title: string): ParsedConsent {
	const lines = content.split("\n").map(normalizeLine).filter(Boolean);
	const head = parseHead(lines, title);

	const blocks: ConsentBlock[] = [];
	const sections: ConsentSection[] = [];
	let lastSection = 0;

	const pushClause = (number: string, text: string) => {
		const isHeading =
			text.length <= SUBSECTION_TITLE_MAX && !/[.:;,]$/.test(text);
		blocks.push(
			isHeading
				? { type: "subsection", number, title: text }
				: { type: "clause", number, text },
		);
	};

	const body = lines
		.slice(head.consumed)
		// Хвост вида «. Оператор: …» — точка, оторвавшаяся от предыдущей строки.
		.map((line) => line.replace(/^[.,;]\s+/, ""));

	for (let index = 0; index < body.length; index++) {
		const line = body[index];

		// Запись: пункт списка «• Название: …», за которым идут поля без
		// маркера. Обычный список реквизитов («• ОГРН: …», «• ИНН: …») сюда
		// не попадает: там у каждой строки свой маркер.
		const bulletField = line.match(BULLET_LINE)?.[1].match(FIELD_LINE);
		if (bulletField && FIELD_LINE.test(body[index + 1] ?? "")) {
			const fields = [{ label: bulletField[1], value: bulletField[2] }];
			while (index + 1 < body.length) {
				const next = body[index + 1].match(FIELD_LINE);
				if (!next) break;
				fields.push({ label: next[1], value: next[2] });
				index++;
			}
			blocks.push({ type: "record", fields });
			continue;
		}

		const clause = line.match(CLAUSE_LINE);
		if (clause) {
			pushClause(clause[1], clause[2]);
			continue;
		}

		const section = line.match(SECTION_LINE);
		if (section) {
			const n = Number(section[1]);
			let heading = section[2];
			let tail: RegExpMatchArray | null = null;

			// «8. Ответственность сторон 8.1. Оператор не несет…» — заголовок и
			// первый пункт раздела в одной строке.
			const glued = heading.match(
				new RegExp(String.raw`^(.+?)\s+(${n}\.\d{1,2})\.?\s+(\S.*)$`),
			);
			if (glued) {
				heading = glued[1];
				tail = glued;
			}

			const isSection =
				n > lastSection &&
				n <= lastSection + SECTION_JUMP_MAX &&
				heading.length <= SECTION_TITLE_MAX &&
				!/[;,]$/.test(heading);

			if (isSection) {
				lastSection = n;
				const entry: ConsentSection = {
					id: `razdel-${n}`,
					number: String(n),
					title: heading.replace(/[.:]$/, ""),
				};
				sections.push(entry);
				blocks.push({ type: "section", ...entry });
				if (tail) pushClause(tail[2], tail[3]);
				continue;
			}

			blocks.push({ type: "clause", number: `${n}.`, text: section[2] });
			continue;
		}

		const bullet = line.match(BULLET_LINE);
		if (bullet) {
			const previous = blocks[blocks.length - 1];
			if (previous?.type === "list") previous.items.push(bullet[1]);
			else blocks.push({ type: "list", items: [bullet[1]] });
			continue;
		}

		blocks.push({ type: "paragraph", text: line });
	}

	return {
		fullTitle: head.fullTitle,
		published: head.published,
		effective: head.effective,
		edition: head.edition,
		sections,
		blocks,
	};
}

const MONTHS = [
	"января",
	"февраля",
	"марта",
	"апреля",
	"мая",
	"июня",
	"июля",
	"августа",
	"сентября",
	"октября",
	"ноября",
	"декабря",
];

/**
 * «24 октября 2026» → дата. Нужна ровно для одного вопроса: вступил ли
 * документ в силу на сегодня. Нераспознанная строка — null, и тогда страница
 * просто показывает дату как написано, не утверждая ничего о статусе.
 */
export function parseRussianDate(value: string | null): Date | null {
	if (!value) return null;
	const match = value.match(/(\d{1,2})\s+([а-яё]+)\s+(\d{4})/i);
	if (!match) return null;
	const month = MONTHS.indexOf(match[2].toLowerCase());
	if (month < 0) return null;
	return new Date(Number(match[3]), month, Number(match[1]));
}
