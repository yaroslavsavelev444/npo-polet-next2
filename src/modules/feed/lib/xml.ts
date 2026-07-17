// src/modules/feed/lib/xml.ts
//
// Низкоуровневые помощники для ручной сборки валидного XML-фида. Билдер не
// тянет внешнюю зависимость (xmlbuilder2 и т.п.): экранирование строк и
// формирование элементов покрываются несколькими чистыми функциями, что
// проще, быстрее и не увеличивает бандл. Главное требование — на выходе
// всегда well-formed XML 1.0, что бы ни лежало в данных товара.

/**
 * Символы, недопустимые в XML 1.0 (управляющие, кроме TAB/LF/CR, а также
 * U+FFFE/U+FFFF), ломают парсер Яндекса целиком — «битый фид» отклоняется
 * весь, а не один offer. Поэтому вырезаем их из ЛЮБОГО текста до вставки.
 * Регэксп задаётся через конструктор со строкой из \u-эскейпов, чтобы в
 * исходнике не было ни одного «сырого» управляющего символа.
 */
const INVALID_XML_CHARS = new RegExp(
	"[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\uFFFE\\uFFFF]",
	"g",
);

function stripInvalidXmlChars(value: string): string {
	return value.replace(INVALID_XML_CHARS, "");
}

/** Экранирование текста внутри элемента: &, <, >. */
export function escapeXml(value: string): string {
	return stripInvalidXmlChars(value)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

/** Экранирование значения атрибута: как текст плюс кавычки. */
export function escapeXmlAttr(value: string): string {
	return escapeXml(value).replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/**
 * Оборачивает текст в CDATA. Единственная опасность CDATA — последовательность
 * `]]>` внутри полезной нагрузки, закрывающая секцию раньше времени. Разрываем
 * её на две валидные CDATA-секции. Управляющие символы тоже вычищаем — CDATA
 * от требований XML 1.0 к набору символов не освобождает.
 */
export function cdata(value: string): string {
	const safe = stripInvalidXmlChars(value).replace(/]]>/g, "]]]]><![CDATA[>");
	return `<![CDATA[${safe}]]>`;
}

type AttrValue = string | number | null | undefined;

function renderAttrs(attrs?: Record<string, AttrValue>): string {
	if (!attrs) return "";
	let out = "";
	for (const [key, raw] of Object.entries(attrs)) {
		if (raw === null || raw === undefined) continue;
		out += ` ${key}="${escapeXmlAttr(String(raw))}"`;
	}
	return out;
}

/**
 * Элемент с текстовым содержимым: `<tag attrs>escaped-text</tag>`.
 * Возвращает пустую строку, если значение пустое, — так необязательные поля
 * просто не попадают в фид, а не создают пустых тегов.
 */
export function el(
	tag: string,
	value: AttrValue,
	attrs?: Record<string, AttrValue>,
): string {
	if (value === null || value === undefined || value === "") return "";
	return `<${tag}${renderAttrs(attrs)}>${escapeXml(String(value))}</${tag}>`;
}

/** Элемент с уже готовым (raw) внутренним XML/CDATA — без повторного экранирования. */
export function elRaw(
	tag: string,
	rawInner: string,
	attrs?: Record<string, AttrValue>,
): string {
	return `<${tag}${renderAttrs(attrs)}>${rawInner}</${tag}>`;
}
