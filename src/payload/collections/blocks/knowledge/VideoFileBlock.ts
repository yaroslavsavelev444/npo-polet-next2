import type { Block } from "payload";

/**
 * Видеофайл, загруженный в медиатеку (Media уже принимает video/mp4 и
 * video/webm — см. upload.mimeTypes в Media.ts).
 *
 * Отдельный блок, а не тот же upload-узел, что и картинки: у видео своя
 * разметка (<video controls preload="metadata">), свой постер и свои правила
 * производительности — ролик нельзя грузить целиком при открытии страницы.
 */
export const VideoFileBlock: Block = {
	slug: "videoFile",
	interfaceName: "KnowledgeVideoFileBlock",
	labels: { singular: "Видеофайл", plural: "Видеофайлы" },
	fields: [
		{
			name: "video",
			type: "upload",
			relationTo: "media",
			required: true,
			label: "Видеофайл",
			filterOptions: {
				mimeType: { contains: "video" },
			},
		},
		{
			name: "poster",
			type: "upload",
			relationTo: "media",
			label: "Обложка",
			filterOptions: {
				mimeType: { contains: "image" },
			},
			admin: {
				description:
					"Кадр, который виден до запуска. Без него браузер показывает пустой чёрный прямоугольник.",
			},
		},
		{
			name: "caption",
			type: "text",
			label: "Подпись под видео",
		},
	],
};
