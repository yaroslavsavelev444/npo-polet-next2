import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs/Breadcrumbs";
import { TopicRow } from "@/modules/knowledge/components/TopicRow";
import {
	getKnowledgeCategoryBySlug,
	getKnowledgeOverview,
} from "@/payload/services/knowledge.service";
import { baseURL } from "@/resources/content";
import { JsonLd } from "@/shared/components/JsonLd";
import { buildBreadcrumbSchema } from "@/shared/lib/seo/schema";

interface CategoryPageProps {
	params: Promise<{ categorySlug: string }>;
}

/**
 * Раздел базы знаний целиком.
 *
 * Отдельная индексируемая страница на раздел, в отличие от
 * `/knowledge?category=…`: у неё стабильный адрес, свой заголовок, своё
 * описание и полный список материалов без ограничения на превью.
 * Фильтрованное состояние главной страницы при этом закрыто от индексации,
 * чтобы одно и то же содержимое не соревновалось само с собой.
 */
async function resolveCategory(slug: string) {
	const found = await getKnowledgeCategoryBySlug(slug);
	if (!found || found.category.isActive === false) return null;
	return found;
}

export async function generateMetadata({
	params,
}: CategoryPageProps): Promise<Metadata> {
	const { categorySlug } = await params;
	const found = await resolveCategory(categorySlug);

	if (!found) {
		return {
			title: "Раздел не найден",
			robots: { index: false, follow: true },
		};
	}

	const { category } = found;
	const title = category.seo?.metaTitle || category.title;
	const description =
		category.seo?.metaDescription ||
		category.description ||
		`Материалы базы знаний НПО «Полёт» в разделе «${category.title}».`;

	return {
		title,
		description,
		alternates: { canonical: `${baseURL}/knowledge/${category.slug}` },
		openGraph: {
			type: "website",
			title: `${title} — НПО Полёт`,
			description,
			url: `${baseURL}/knowledge/${category.slug}`,
		},
	};
}

export default async function KnowledgeCategoryPage({
	params,
}: CategoryPageProps) {
	const { categorySlug } = await params;
	const found = await resolveCategory(categorySlug);

	if (!found) notFound();

	// Зашли по прежнему адресу раздела — уводим 301 на актуальный, чтобы одно
	// содержимое не жило по двум URL.
	if (!found.canonical) {
		permanentRedirect(`/knowledge/${found.category.slug}`);
	}

	const { category } = found;
	const overview = await getKnowledgeOverview();
	const branch = overview.tree.find(
		(entry) => entry.category.id === category.id,
	);

	const breadcrumbItems = [
		{ title: "Главная", href: "/" },
		{ title: "База знаний", href: "/knowledge" },
		{ title: category.title },
	];

	return (
		<main className="mx-auto flex w-full max-w-4xl flex-col gap-8 !px-4 !py-8 sm:!px-6 sm:!py-10">
			<div className="flex flex-col gap-6">
				<Breadcrumbs items={breadcrumbItems} />
				<JsonLd data={buildBreadcrumbSchema(breadcrumbItems)} />

				<header className="flex flex-col gap-3">
					<h1 className="text-3xl font-semibold tracking-[-0.03em] text-[var(--text-primary)] sm:text-4xl">
						{category.title}
					</h1>

					{category.description && (
						<p className="max-w-[54ch] text-base leading-relaxed text-[var(--text-secondary)]">
							{category.description}
						</p>
					)}

					<p className="text-sm text-[var(--text-muted)]">
						{branch?.total ?? 0} {pluralize(branch?.total ?? 0)}
					</p>
				</header>
			</div>

			{branch && branch.groups.length > 0 ? (
				<div className="flex flex-col gap-9">
					{branch.groups.map((group, index) => (
						<section
							key={group.section?.id ?? "loose"}
							className="reveal-up"
							style={{
								["--reveal-delay" as string]: `${Math.min(index, 6) * 45}ms`,
							}}
						>
							{group.section && (
								<div className="mb-2">
									<h2 className="text-sm font-semibold text-[var(--text-primary)]">
										{group.section.title}
									</h2>
									{group.section.description && (
										<p className="mt-0.5 text-sm text-[var(--text-secondary)]">
											{group.section.description}
										</p>
									)}
								</div>
							)}

							<ul className="border-t border-[var(--border)]">
								{group.topics.map((topic) => (
									<li
										key={topic.id}
										className="border-b border-[var(--border)]"
									>
										<TopicRow topic={topic} className="!py-3.5" />
									</li>
								))}
							</ul>
						</section>
					))}
				</div>
			) : (
				<p className="!py-16 text-center text-sm text-[var(--text-secondary)]">
					В этом разделе пока нет опубликованных материалов.
				</p>
			)}
		</main>
	);
}

function pluralize(count: number): string {
	const mod10 = count % 10;
	const mod100 = count % 100;
	if (mod10 === 1 && mod100 !== 11) return "материал";
	if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14))
		return "материала";
	return "материалов";
}
