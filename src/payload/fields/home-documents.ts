import type { Field, FieldHook } from "payload";

/**
 * Документы блока «Доверие» на главной странице.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ ЭТО МАССИВ В НАСТРОЙКАХ, А НЕ КОЛЛЕКЦИЯ
 * ────────────────────────────────────────────────────────────────────────────
 * Список короткий, порядок в нём важен, и живёт он ровно в одном месте —
 * в одном блоке одной страницы. Коллекция дала бы ему собственный раздел в
 * админке, своё поле сортировки, свой сервис и свой тег кэша: три новых
 * механизма ради пяти строк. Массив в глобале «Настройки сайта» уже умеет
 * всё нужное — перетаскивание меняет порядок, а кэш и его сброс работают
 * ровно так же, как для фона Hero и картинок страниц входа
 * (getCachedSettings + createRevalidateCacheHook('settings')).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ФАЙЛ ИЛИ ССЫЛКА — НО НЕ ОБА
 * ────────────────────────────────────────────────────────────────────────────
 * Источник выбирается переключателем `sourceType`, и лишнее поле не просто
 * прячется, а ОЧИЩАЕТСЯ при сохранении (см. clearUnlessSource ниже). Одного
 * `admin.condition` для этого мало: спрятанное поле сохраняет своё значение в
 * базе, и документ, у которого сперва загрузили файл, а потом переключились
 * на ссылку, уехал бы в базу с обоими источниками сразу — а какой из них
 * главный, дальше пришлось бы угадывать в каждом месте чтения.
 *
 * Ровно тот же приём уже применён к инструкции товара (Products.instruction),
 * поэтому администратору форма знакома.
 */

type SourceType = "file" | "url";

/**
 * Соседние поля той же строки массива в момент проверки. Описано узко —
 * `validate` у Payload получает весь контекст документа, но правилам ниже
 * нужен ровно один переключатель, и расширять тип значило бы позволить им
 * зависеть от чего-то ещё.
 */
type DocumentRow = { sourceType?: SourceType };

function rowSourceType(siblingData: unknown): SourceType | undefined {
	return (siblingData as DocumentRow | undefined)?.sourceType;
}

/**
 * Обнуляет поле, если выбран другой источник. Возвращается именно `null`, а
 * не `undefined`: Payload трактует `undefined` как «поле не прислали» и
 * оставляет прежнее значение в базе.
 */
const clearUnlessSource =
	(expected: SourceType): FieldHook =>
	({ siblingData, value }) =>
		rowSourceType(siblingData) === expected ? value : null;

/**
 * Разрешённая ссылка: абсолютный http(s) или путь внутри сайта («/faq»).
 *
 * Относительный путь разрешён сознательно: «Реквизиты компании» могут вести
 * на собственную страницу, и заставлять администратора писать полный домен
 * значило бы ломать ссылку при каждом переезде или открытии сайта по второму
 * адресу. Всё остальное (`javascript:`, `data:`, `mailto:` без схемы и просто
 * опечатки вроде «www.example.com») отклоняется: такая ссылка либо не
 * работает, либо опасна.
 */
function isAllowedHref(value: string): boolean {
	if (value.startsWith("/")) return !value.startsWith("//");
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:";
	} catch {
		return false;
	}
}

export const homeDocumentsField: Field = {
	name: "homeDocuments",
	type: "array",
	label: "Документы на главной",
	labels: { singular: "Документ", plural: "Документы" },
	admin: {
		initCollapsed: true,
		description:
			"Блок «Чем это подтверждается» → «Документы» на главной странице. Порядок задаётся перетаскиванием строк, показываются только включённые документы. Если ни одного включённого нет, блок покажет короткое сообщение вместо списка.",
		components: {
			RowLabel: "@/payload/fields/HomeDocumentRowLabel#HomeDocumentRowLabel",
		},
	},
	fields: [
		{
			name: "title",
			type: "text",
			required: true,
			maxLength: 120,
			label: "Название",
			admin: {
				description:
					"Как документ называется для посетителя: «Сертификат соответствия», «Декларация соответствия», «Реквизиты компании» — любое название.",
			},
		},
		{
			name: "sourceType",
			type: "select",
			required: true,
			defaultValue: "file",
			label: "Что открывается по клику",
			// Явное имя типа в БД: без него имя выводится из пути к полю, и
			// любое переименование поля тихо ломает миграцию.
			enumName: "home_document_source_enum",
			options: [
				{ label: "Загруженный файл", value: "file" },
				{ label: "Внешняя ссылка", value: "url" },
			],
		},
		{
			name: "file",
			type: "upload",
			relationTo: "media",
			label: "Файл",
			admin: {
				condition: (_, siblingData) => siblingData?.sourceType === "file",
				description:
					"PDF, изображение или офисный документ. Список разрешённых типов задан в коллекции «Медиа».",
			},
			hooks: { beforeChange: [clearUnlessSource("file")] },
			validate: (value: unknown, { siblingData }: { siblingData: unknown }) => {
				if (rowSourceType(siblingData) !== "file") return true;
				return value ? true : "Загрузите файл или переключитесь на ссылку";
			},
		},
		{
			name: "url",
			type: "text",
			label: "Ссылка",
			admin: {
				condition: (_, siblingData) => siblingData?.sourceType === "url",
				description:
					"Полный адрес (https://…) или путь внутри сайта, начинающийся со «/».",
			},
			hooks: { beforeChange: [clearUnlessSource("url")] },
			validate: (value: unknown, { siblingData }: { siblingData: unknown }) => {
				if (rowSourceType(siblingData) !== "url") return true;
				if (typeof value !== "string" || value.trim() === "") {
					return "Укажите ссылку или переключитесь на файл";
				}
				return isAllowedHref(value.trim())
					? true
					: "Ссылка должна начинаться с http://, https:// или со «/»";
			},
		},
		{
			name: "isActive",
			type: "checkbox",
			defaultValue: true,
			label: "Показывать на сайте",
			admin: {
				description:
					"Снимите галочку, чтобы временно убрать документ с главной, не удаляя его.",
			},
		},
	],
};
