import { baseURL } from "@/resources/content";
import type { KnowledgeArticle } from "../types";

/**
 * Structured data статьи базы знаний.
 *
 * Тип TechArticle, а не Article или BlogPosting: материалы базы знаний — это
 * руководства по эксплуатации и обслуживанию конкретной техники, и
 * schema.org/TechArticle описывает ровно этот жанр (для новостной ленты
 * подошёл бы BlogPosting, но её здесь нет).
 *
 * `isPartOf` связывает статью с разделом, `about` — с темой; вместе они дают
 * поисковику структуру базы знаний, которую иначе пришлось бы угадывать по
 * хлебным крошкам.
 */
export function buildArticleSchema(
	article: KnowledgeArticle,
	imageUrl: string | null,
) {
	const { topic, category } = article;
	const url = `${baseURL}/knowledge/${category.slug}/${topic.slug}`;

	return {
		"@context": "https://schema.org",
		"@type": "TechArticle",
		headline: topic.title,
		...(topic.description ? { description: topic.description } : {}),
		url,
		mainEntityOfPage: { "@type": "WebPage", "@id": url },
		inLanguage: "ru-RU",
		datePublished: topic.publishedAt ?? topic.createdAt,
		dateModified: topic.updatedAt,
		...(imageUrl ? { image: [imageUrl] } : {}),
		...(topic.readingTime
			? // ISO 8601 duration: PT7M — семь минут.
				{ timeRequired: `PT${topic.readingTime}M` }
			: {}),
		publisher: {
			"@type": "Organization",
			name: "НПО Полёт",
			url: baseURL,
		},
		isPartOf: {
			"@type": "CollectionPage",
			name: category.title,
			url: `${baseURL}/knowledge/${category.slug}`,
		},
		...(Array.isArray(topic.tags) && topic.tags.length > 0
			? {
					keywords: topic.tags
						.map((entry) => entry.tag)
						.filter(Boolean)
						.join(", "),
				}
			: {}),
	};
}
