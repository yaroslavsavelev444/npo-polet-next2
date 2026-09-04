import type { Block } from "payload";
import { parseVideoUrl } from "../../../../modules/knowledge/lib/videoEmbed.ts";

/**
 * Внешнее видео (YouTube / Vimeo / VK / Rutube) внутри статьи.
 *
 * Адрес проверяется на сохранении, а не только при рендере: редактор должен
 * узнать о нераспознанной ссылке сразу, а не обнаружить пустое место на
 * опубликованной странице. Сам разбор и белый список провайдеров — в
 * modules/knowledge/lib/videoEmbed.ts (там же объяснено, почему произвольный
 * iframe src недопустим).
 */
export const VideoEmbedBlock: Block = {
	slug: "videoEmbed",
	interfaceName: "KnowledgeVideoEmbedBlock",
	labels: { singular: "Видео по ссылке", plural: "Видео по ссылке" },
	fields: [
		{
			name: "url",
			type: "text",
			required: true,
			label: "Ссылка на видео",
			admin: {
				description:
					"YouTube, Vimeo, VK Видео или Rutube. Ссылка со страницы ролика — она будет преобразована в embed автоматически.",
			},
			validate: (value: string | null | undefined) => {
				if (!value) return "Укажите ссылку на видео";
				return parseVideoUrl(value)
					? true
					: "Не удалось распознать ссылку. Поддерживаются YouTube, Vimeo, VK Видео и Rutube.";
			},
		},
		{
			name: "title",
			type: "text",
			label: "Название ролика",
			admin: {
				description:
					"Подставляется в title фрейма — его читают скринридеры. Если пусто, будет использовано название статьи.",
			},
		},
		{
			name: "caption",
			type: "text",
			label: "Подпись под видео",
		},
	],
};
