import { Clock3 } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound, permanentRedirect } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs/Breadcrumbs";
import { RichContent } from "@/modules/knowledge/components/content/RichContent";
import { RelatedTopics } from "@/modules/knowledge/components/RelatedTopics";
import { buildArticleSchema } from "@/modules/knowledge/lib/articleSchema";
import type { KnowledgeArticle } from "@/modules/knowledge/types";
import {
	getKnowledgeCategories,
	getKnowledgeTopicByPreviousSlug,
	getKnowledgeTopicBySlug,
	resolveRelatedTopics,
} from "@/payload/services/knowledge.service";
import type { Media } from "@/payload-types";
import { baseURL } from "@/resources/content";
import { JsonLd } from "@/shared/components/JsonLd";
import { buildBreadcrumbSchema } from "@/shared/lib/seo/schema";

interface ArticlePageProps {
	params: Promise<{ categorySlug: string; topicSlug: string }>;
}

function mediaOf(value: unknown): Media | null {
	return value && typeof value === "object" ? (value as Media) : null;
}

function canonicalPath(article: KnowledgeArticle): string {
	return `/knowledge/${article.category.slug}/${article.topic.slug}`;
}

export async function generateMetadata({
	params,
}: ArticlePageProps): Promise<Metadata> {
	const { topicSlug } = await params;
	const article = await getKnowledgeTopicBySlug(topicSlug);

	if (!article) {
		return {
			title: "Материал не найден",
			robots: { index: false, follow: true },
		};
	}

	const { topic } = article;
	const title = topic.seo?.metaTitle || topic.title;
	const description =
		topic.seo?.metaDescription ||
		topic.description ||
		`Материал базы знаний НПО «Полёт»: ${topic.title}.`;
	const image = mediaOf(topic.seo?.ogImage) ?? mediaOf(topic.image);
	const url = `${baseURL}${canonicalPath(article)}`;

	return {
		title,
		description,
		// Каноникал строится от актуального раздела: если статью перенесли,
		// старый путь ведёт сюда 301-редиректом, и в индексе остаётся один адрес.
		alternates: { canonical: url },
		openGraph: {
			type: "article",
			title: `${title} — НПО Полёт`,
			description,
			url,
			publishedTime: topic.publishedAt ?? topic.createdAt,
			modifiedTime: topic.updatedAt,
			...(image?.url
				? { images: [{ url: image.url, alt: image.alt ?? title }] }
				: {}),
		},
		twitter: {
			card: image?.url ? "summary_large_image" : "summary",
			title: `${title} — НПО Полёт`,
			description,
			...(image?.url ? { images: [image.url] } : {}),
		},
	};
}

export default async function KnowledgeArticlePage({
	params,
}: ArticlePageProps) {
	const { categorySlug, topicSlug } = await params;

	const article = await getKnowledgeTopicBySlug(topicSlug);

	if (!article) {
		// Статьи с таким адресом нет — возможно, адрес меняли. Прежние slug'и
		// ведут на актуальный 301-редиректом: адрес мог быть проиндексирован, и
		// превращать его в 404 значит терять и позицию, и внешние ссылки.
		const moved = await getKnowledgeTopicByPreviousSlug(topicSlug);
		if (moved?.slug) {
			const movedCategory =
				typeof moved.category === "object" ? moved.category : null;
			permanentRedirect(
				`/knowledge/${movedCategory?.slug ?? categorySlug}/${moved.slug}`,
			);
		}

		// Черновики и материалы отключённых разделов сюда тоже приходят: для
		// анонимного посетителя они не существуют, и 404 — единственный
		// корректный ответ (иначе сам факт существования черновика становится
		// наблюдаемым).
		notFound();
	}

	// Раздел в адресе не совпал с текущим разделом статьи (её перенесли) —
	// уводим на канонический путь.
	if (categorySlug !== article.category.slug) {
		permanentRedirect(canonicalPath(article));
	}

	const { topic, category, section } = article;
	const categories = await getKnowledgeCategories();
	const related = resolveRelatedTopics(article, categories);

	const cover = mediaOf(topic.image);
	const publishedAt = topic.publishedAt ?? topic.createdAt;

	const breadcrumbItems = [
		{ title: "База знаний", href: "/knowledge" },
		{ title: category.title, href: `/knowledge/${category.slug}` },
		// Секция — необязательное звено: её просто нет в цепочке, когда статья
		// лежит в разделе напрямую. Своей страницы у секции нет, поэтому ведём
		// на отфильтрованный список.
		...(section
			? [
					{
						title: section.title,
						href: `/knowledge?category=${category.slug}&section=${section.slug}`,
					},
				]
			: []),
		{ title: topic.title },
	];

	return (
		<main className="mx-auto flex w-full max-w-[46rem] flex-col !px-4 !py-8 sm:!px-6 sm:!py-10">
			<Breadcrumbs items={breadcrumbItems} />
			<JsonLd
				data={buildBreadcrumbSchema([
					{ title: "Главная", href: "/" },
					...breadcrumbItems,
				])}
			/>
			<JsonLd data={buildArticleSchema(article, cover?.url ?? null)} />

			<article className="mt-6">
				<header className="reveal-up flex flex-col gap-4">
					<h1 className="text-balance text-3xl font-semibold leading-[1.12] tracking-[-0.03em] text-[var(--text-primary)] sm:text-[2.5rem]">
						{topic.title}
					</h1>

					{topic.description && (
						<p className="text-pretty text-lg leading-relaxed text-[var(--text-secondary)]">
							{topic.description}
						</p>
					)}

					<div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[var(--text-muted)]">
						{publishedAt && (
							<time dateTime={publishedAt}>{formatDate(publishedAt)}</time>
						)}
						{topic.readingTime ? (
							<span className="inline-flex items-center gap-1.5">
								<Clock3 size={13} aria-hidden />
								{topic.readingTime} мин чтения
							</span>
						) : null}
					</div>
				</header>

				{cover?.url && (
					<div
						className="reveal-up mt-8 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]"
						style={{ ["--reveal-delay" as string]: "60ms" }}
					>
						<Image
							src={cover.url}
							alt={cover.alt ?? ""}
							width={cover.width ?? 1600}
							height={cover.height ?? 900}
							sizes="(max-width: 768px) 100vw, 736px"
							priority
							className="h-auto w-full"
						/>
					</div>
				)}

				<div
					className="reveal-up mt-9"
					style={{ ["--reveal-delay" as string]: "110ms" }}
				>
					<RichContent content={topic.content} />
				</div>

				{Array.isArray(topic.tags) && topic.tags.length > 0 && (
					<ul className="mt-10 flex flex-wrap gap-2">
						{topic.tags
							.filter((entry) => entry.tag)
							.map((entry) => (
								<li
									key={entry.id ?? entry.tag}
									className="rounded-full border border-[var(--border)] !px-3 !py-1 text-xs text-[var(--text-muted)]"
								>
									{entry.tag}
								</li>
							))}
					</ul>
				)}
			</article>

			<RelatedTopics topics={related} />
		</main>
	);
}

function formatDate(value: string): string {
	return new Date(value).toLocaleDateString("ru-RU", {
		day: "numeric",
		month: "long",
		year: "numeric",
	});
}
