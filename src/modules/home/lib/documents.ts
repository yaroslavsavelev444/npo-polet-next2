import type { Media, Setting } from "@/payload-types";

/**
 * modules/home/lib/documents — настройки Payload → готовые ссылки блока
 * «Документы» на главной.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЗАЧЕМ ОТДЕЛЬНЫЙ СЛОЙ
 * ────────────────────────────────────────────────────────────────────────────
 * Компонент не должен знать ни про `sourceType`, ни про то, что файл может
 * оказаться удалённым, ни про разницу между внешней ссылкой и внутренним
 * путём. Всё это — решения о данных, и приниматься они должны один раз, на
 * сервере, до отрисовки. Компоненту достаётся плоский список «название +
 * href + как открывать».
 *
 * Здесь же отсеиваются заведомо нерабочие записи (см. ниже): показать
 * ссылку, ведущую в никуда, хуже, чем не показать её вовсе, — посетитель
 * решит, что сломан сайт, а не что администратор не дозаполнил документ.
 */

export interface HomeDocumentLink {
	/** Ключ строки: id строки массива, а он у Payload стабилен. */
	id: string;
	title: string;
	href: string;
	/**
	 * Чем открывается строка. Три случая ведут себя по-разному, и решать это
	 * должен слой данных, а не разметка:
	 *   • `internal` — путь внутри сайта: обычный переход, та же вкладка;
	 *   • `file`     — загруженный файл на нашем же домене: новая вкладка,
	 *                  чтобы посетитель не терял место на длинной главной;
	 *   • `external` — чужой сайт: новая вкладка + rel и заметная пометка.
	 */
	kind: "internal" | "file" | "external";
	/**
	 * Скачивать, а не открывать. Только для форматов, которые браузер всё
	 * равно не покажет: у .docx и .xlsx «открытие» — это то же скачивание, но
	 * с именем файла вида «a1b2c3». Атрибут `download` возвращает нормальное
	 * имя. PDF и изображения открываются как были: смотреть сертификат прямо
	 * во вкладке удобнее, чем сначала класть его на диск.
	 */
	shouldDownload: boolean;
	/** Короткая подпись справа: «PDF · 1,2 МБ» или домен внешней ссылки. */
	meta: string;
}

/** Подписи форматов. Всё, чего здесь нет, обозначается как «Файл». */
const FORMAT_LABELS: Record<string, string> = {
	"application/pdf": "PDF",
	"image/jpeg": "JPG",
	"image/png": "PNG",
	"image/webp": "WEBP",
	"application/msword": "DOC",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document":
		"DOCX",
	"application/vnd.ms-excel": "XLS",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
};

/** Форматы, которые браузер показать не может — их честнее скачивать. */
const DOWNLOAD_ONLY = new Set([
	"application/msword",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"application/vnd.ms-excel",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

function isPopulatedMedia(value: unknown): value is Media {
	return typeof value === "object" && value !== null;
}

function formatSize(bytes: number | null | undefined): string | null {
	if (!bytes || bytes <= 0) return null;
	if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
	const mb = bytes / (1024 * 1024);
	return `${mb.toFixed(mb < 10 ? 1 : 0).replace(".", ",")} МБ`;
}

/**
 * Домен для подписи внешней ссылки. `www.` отбрасывается: он ничего не
 * сообщает и съедает место в узкой колонке.
 */
function hostLabel(href: string): string | null {
	try {
		return new URL(href).hostname.replace(/^www\./, "");
	} catch {
		return null;
	}
}

/**
 * Тот же список разрешённых адресов, что проверяет админка
 * (payload/fields/home-documents). Дублируется он не по недосмотру: правило
 * админки защищает от опечатки при вводе, а это — от записи, попавшей в базу
 * до появления проверки или мимо неё (импорт, ручная правка). Отдать в
 * `href` строку вида `javascript:…` нельзя ни при каких условиях.
 */
function normalizeHref(
	raw: string,
): { href: string; kind: "internal" | "external" } | null {
	const value = raw.trim();
	if (value === "") return null;

	// Путь внутри сайта. `//host` — это протокол-относительный адрес, то есть
	// внешний, и внутренним его считать нельзя.
	if (value.startsWith("/")) {
		return value.startsWith("//") ? null : { href: value, kind: "internal" };
	}

	try {
		const url = new URL(value);
		if (url.protocol !== "http:" && url.protocol !== "https:") return null;
		return { href: value, kind: "external" };
	} catch {
		return null;
	}
}

/**
 * Активные документы в заданном администратором порядке.
 *
 * Порядок массива Payload сохраняет сам (служебное поле `_order`), поэтому
 * сортировать здесь нечего — достаточно не перемешивать.
 *
 * Пропускаются записи, которые не могут никуда привести:
 *   • выключенные (`isActive: false`) — администратор снял их сознательно;
 *   • с выбранным файлом, которого больше нет (медиа удалили после создания
 *     документа) или который почему-то без url;
 *   • с пустой или недопустимой ссылкой.
 */
export function getHomeDocuments(settings: Setting | null): HomeDocumentLink[] {
	const rows = settings?.homeDocuments ?? [];
	const documents: HomeDocumentLink[] = [];

	for (const [index, row] of rows.entries()) {
		if (row.isActive === false) continue;

		const title = row.title?.trim();
		if (!title) continue;

		const id = row.id ?? `${index}`;

		if (row.sourceType === "url") {
			const link = normalizeHref(row.url ?? "");
			if (!link) continue;

			documents.push({
				id,
				title,
				href: link.href,
				kind: link.kind,
				shouldDownload: false,
				meta:
					link.kind === "external"
						? (hostLabel(link.href) ?? "Ссылка")
						: "Раздел сайта",
			});
			continue;
		}

		// sourceType === 'file'
		if (!isPopulatedMedia(row.file) || !row.file.url) continue;

		const mimeType = row.file.mimeType ?? "";
		const format = FORMAT_LABELS[mimeType] ?? "Файл";
		const size = formatSize(row.file.filesize);

		documents.push({
			id,
			title,
			href: row.file.url,
			kind: "file",
			shouldDownload: DOWNLOAD_ONLY.has(mimeType),
			meta: size ? `${format} · ${size}` : format,
		});
	}

	return documents;
}
