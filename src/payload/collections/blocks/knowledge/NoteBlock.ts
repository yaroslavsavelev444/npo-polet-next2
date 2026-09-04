import type { Block } from "payload";

/**
 * Врезка: примечание, предупреждение или важное замечание.
 *
 * В руководствах по эксплуатации это не украшение — предупреждение о технике
 * безопасности обязано визуально отделяться от обычного абзаца, иначе его
 * пролистывают. Три уровня, дальше не расширяем: больше вариантов означает,
 * что редакторы начнут выбирать их по вкусу, и сигнал обесценится.
 */
export const NoteBlock: Block = {
	slug: "note",
	interfaceName: "KnowledgeNoteBlock",
	labels: { singular: "Врезка", plural: "Врезки" },
	fields: [
		{
			name: "variant",
			type: "select",
			required: true,
			defaultValue: "info",
			label: "Тип",
			options: [
				{ label: "Примечание", value: "info" },
				{ label: "Внимание", value: "warning" },
				{ label: "Совет", value: "tip" },
			],
		},
		{
			name: "title",
			type: "text",
			label: "Заголовок врезки",
		},
		{
			name: "text",
			type: "textarea",
			required: true,
			label: "Текст",
		},
	],
};
