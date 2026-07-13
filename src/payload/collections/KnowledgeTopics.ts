import type { CollectionConfig } from "payload";
import { createRevalidateCacheHook } from "../hooks/revalidateCache.ts";
import { HeadingBlock } from "./blocks/HeadingBlock.ts";
import { ImageBlock } from "./blocks/ImageBlock.ts";
import { LinkBlock } from "./blocks/LinkBlock.ts";
import { TextBlock } from "./blocks/TextBlock.ts";

export const KnowledgeTopics: CollectionConfig = {
	slug: "knowledge-topics",

	admin: {
		useAsTitle: "title",
		defaultColumns: ["title", "slug", "published", "position", "updatedAt"],
		group: "Контент",
	},

	access: {
		read: () => true,
	},

	hooks: {
		// getCachedKnowledgeTopics кэширует список с revalidate:false — без
		// этого хука изменения статей не появлялись бы на сайте до редеплоя.
		afterChange: [createRevalidateCacheHook("knowledge-topics")],
		afterDelete: [createRevalidateCacheHook("knowledge-topics")],
	},

	fields: [
		{
			name: "title",
			type: "text",
			required: true,
			index: true,
		},

		{
			name: "slug",
			type: "text",
			required: true,
			unique: true,
			index: true,
		},

		{
			name: "description",
			type: "textarea",
		},

		{
			name: "image",
			type: "relationship",
			relationTo: "media",
		},

		{
			name: "position",
			type: "number",
			defaultValue: 0,
			index: true,
		},

		{
			name: "featured",
			type: "checkbox",
			defaultValue: false,
		},

		{
			name: "published",
			type: "checkbox",
			defaultValue: true,
			index: true,
		},

		{
			name: "publishedAt",
			type: "date",
		},

		{
			name: "author",
			type: "relationship",
			relationTo: "users",
		},

		{
			name: "content",
			type: "blocks",
			blocks: [HeadingBlock, TextBlock, ImageBlock, LinkBlock],
		},

		{
			name: "readingTime",
			type: "number",
			admin: {
				readOnly: true,
			},
		},

		{
			name: "tags",
			type: "array",
			fields: [
				{
					name: "tag",
					type: "text",
				},
			],
		},

		{
			name: "seo",
			type: "group",
			fields: [
				{
					name: "metaTitle",
					type: "text",
				},

				{
					name: "metaDescription",
					type: "textarea",
				},

				{
					name: "ogImage",
					type: "relationship",
					relationTo: "media",
				},
			],
		},
	],
};
