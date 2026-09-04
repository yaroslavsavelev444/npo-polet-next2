import type {
	KnowledgeCategory,
	KnowledgeSection,
	KnowledgeTopic,
	Media,
} from "@/payload-types";

/**
 * Облегчённая проекция статьи для списков.
 *
 * Списки никогда не тянут `content` и `searchText` — это самые тяжёлые поля
 * коллекции, и на странице с полусотней карточек они дали бы мегабайты
 * трафика RSC ради данных, которые не отображаются.
 */
export interface KnowledgeTopicSummary {
	id: number;
	title: string;
	slug: string;
	description: string | null;
	readingTime: number | null;
	publishedAt: string | null;
	updatedAt: string;
	featured: boolean;
	position: number;
	categoryId: number | null;
	categorySlug: string | null;
	categoryTitle: string | null;
	sectionId: number | null;
	image: KnowledgeImage | null;
}

export interface KnowledgeImage {
	url: string;
	alt: string;
	width: number | null;
	height: number | null;
}

/** Статья + её раздел и секция, разрешённые в объекты. */
export interface KnowledgeArticle {
	topic: KnowledgeTopic;
	category: KnowledgeCategory;
	section: KnowledgeSection | null;
}

/** Группа материалов внутри раздела: либо секция, либо «без секции». */
export interface KnowledgeGroup {
	section: KnowledgeSection | null;
	topics: KnowledgeTopicSummary[];
}

export interface KnowledgeCategoryTree {
	category: KnowledgeCategory;
	groups: KnowledgeGroup[];
	total: number;
}

export interface KnowledgeOverview {
	tree: KnowledgeCategoryTree[];
	featured: KnowledgeTopicSummary[];
	totalTopics: number;
	/** true, если корпус превысил потолок выборки и дерево показано не целиком. */
	truncated: boolean;
}

/** Результат поиска: статья + куски текста, по которым она нашлась. */
export interface KnowledgeSearchHit extends KnowledgeTopicSummary {
	/** Фрагмент текста статьи вокруг первого совпадения. */
	snippet: string | null;
}

export interface KnowledgeSearchResult {
	hits: KnowledgeSearchHit[];
	total: number;
	page: number;
	totalPages: number;
}

export interface KnowledgeFilters {
	q: string;
	category: string | null;
	section: string | null;
	page: number;
}

export type MediaLike = number | Media | null | undefined;
