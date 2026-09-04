import type { CollectionBeforeChangeHook } from "payload";
import { SEARCH_BODY_SEPARATOR } from "../../../modules/knowledge/lib/constants.ts";

/** Средняя скорость чтения технического текста на русском, слов в минуту. */
const WORDS_PER_MINUTE = 160;

/**
 * Максимальная длина поискового индекса одной статьи. Тексты длиннее просто
 * обрезаются: смысл поля — найти статью, а не воспроизвести её, и хранить в
 * каждой строке таблицы мегабайт текста ради последнего абзаца незачем.
 */
const MAX_SEARCH_TEXT = 30_000;

/** Поля блоков, содержимое которых является текстом статьи, а не настройкой. */
const BLOCK_TEXT_FIELDS = new Set(["text", "title", "caption"]);

/**
 * Плоский текст lexical-документа.
 *
 * Своя реализация вместо convertLexicalToPlaintext из библиотеки: её эвристика
 * обходит только `text` и `children`, а содержимое блоков (текст врезки,
 * подпись к видео) живёт в `fields` и в индекс не попадало — предупреждение о
 * технике безопасности, оформленное врезкой, не находилось поиском вообще.
 *
 * Из `fields` берём только осмысленные текстовые поля: значения вроде
 * `blockType`, `variant` или ссылки на видео искать бессмысленно, а в индексе
 * они дают ложные совпадения.
 */
function toPlaintext(node: unknown, out: string[] = []): string[] {
	if (!node || typeof node !== "object") return out;

	if (Array.isArray(node)) {
		for (const item of node) toPlaintext(item, out);
		return out;
	}

	const record = node as Record<string, unknown>;

	if (typeof record.text === "string") out.push(record.text);

	if (record.fields && typeof record.fields === "object") {
		for (const [key, value] of Object.entries(
			record.fields as Record<string, unknown>,
		)) {
			if (typeof value === "string" && BLOCK_TEXT_FIELDS.has(key))
				out.push(value);
		}
	}

	if (Array.isArray(record.children)) toPlaintext(record.children, out);
	if (record.root && typeof record.root === "object")
		toPlaintext(record.root, out);

	return out;
}

function asText(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function normalize(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

/**
 * Готовит статью к сохранению: денормализует текст для поиска, считает время
 * чтения и убирает ссылку статьи на саму себя из рекомендаций.
 *
 * Зачем денормализованный `searchText`. Содержимое статьи лежит в БД как
 * lexical-JSON — искать по нему через `like` бессмысленно: запрос совпадёт с
 * названиями узлов, атрибутами форматирования и id вложенных документов, а не
 * с тем, что человек видит на экране. Плоский текст, посчитанный один раз при
 * сохранении, даёт честный поиск по СОДЕРЖИМОМУ статьи (а не только по
 * заголовку) без второго хранилища и без индексации на каждом запросе.
 */
export const indexKnowledgeTopic: CollectionBeforeChangeHook = async ({
	data,
	originalDoc,
	req,
}) => {
	// Через REST PATCH в `data` приходят только изменённые поля, поэтому везде
	// подстраховываемся значением из originalDoc — иначе правка одного лишь
	// заголовка обнулила бы поисковый индекс всей статьи.
	const content = data.content ?? originalDoc?.content;
	const body = normalize(toPlaintext(content).join(" "));

	const title = asText(data.title ?? originalDoc?.title);
	const description = asText(data.description ?? originalDoc?.description);
	const rawTags = data.tags ?? originalDoc?.tags;
	const tags = Array.isArray(rawTags)
		? rawTags
				.map((entry: { tag?: string | null }) => entry?.tag ?? "")
				.filter(Boolean)
				.join(" ")
		: "";

	// Заголовок, описание и теги входят в индекс вместе с телом — тогда одно
	// поле в `where` покрывает все места, где слово может встретиться, и
	// поисковый запрос не приходится размножать по четырём колонкам.
	// Между шапкой и телом стоит разделитель — см. SEARCH_BODY_SEPARATOR.
	const head = normalize([title, description, tags].join(" "));
	data.searchText = `${head} ${SEARCH_BODY_SEPARATOR} ${body}`.slice(
		0,
		MAX_SEARCH_TEXT,
	);

	// Время чтения считаем по телу статьи, а не по индексу: заголовок и теги
	// читателя не задерживают.
	const words = body ? body.split(" ").filter(Boolean).length : 0;
	data.readingTime =
		words > 0 ? Math.max(1, Math.round(words / WORDS_PER_MINUTE)) : 0;

	// Статья не может рекомендовать саму себя. Полагаться только на
	// filterOptions в админке нельзя: связь может прийти и через REST/Local API,
	// а на рендере такую ссылку пришлось бы отфильтровывать в каждом месте.
	if (
		Array.isArray(data.related) &&
		originalDoc?.id !== undefined &&
		originalDoc?.id !== null
	) {
		data.related = data.related.filter((entry: unknown) => {
			const id =
				entry !== null && typeof entry === "object"
					? (entry as { id?: unknown }).id
					: entry;
			return String(id) !== String(originalDoc.id);
		});
	}

	// Секция обязана принадлежать выбранному разделу. Без этой проверки смена
	// раздела оставляла бы статью в секции чужого раздела — на странице она
	// попадала бы в группу, которой там нет, и просто исчезала бы из списка.
	// Чистим молча, а не отклоняем запись: filterOptions в админке такой выбор
	// и так не даст, а через API это скорее рассинхрон, чем осмысленный ввод.
	const category = data.category ?? originalDoc?.category;
	const section = data.section ?? originalDoc?.section;
	data.section = await resolveSection(req, category, section);

	return data;
};

/** id из связи, которая может прийти и объектом, и скаляром. */
function relationId(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	if (typeof value === "object") {
		const id = (value as { id?: unknown }).id;
		return id === undefined ? null : String(id);
	}
	return String(value);
}

async function resolveSection(
	req: Parameters<CollectionBeforeChangeHook>[0]["req"],
	category: unknown,
	section: unknown,
): Promise<unknown> {
	const sectionId = relationId(section);
	const categoryId = relationId(category);

	if (!sectionId) return null;
	if (!categoryId) return null;

	try {
		const doc = await req.payload.findByID({
			collection: "knowledge-sections",
			id: sectionId,
			depth: 0,
			overrideAccess: true,
		});
		return relationId(doc?.category) === categoryId ? section : null;
	} catch {
		// Секции уже нет (удалили параллельно) — связь всё равно нерабочая.
		return null;
	}
}
