import type { Metadata } from "next";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/Breadcrumbs/Breadcrumbs";
import { KnowledgeBrowse } from "@/modules/knowledge/components/KnowledgeBrowse";
import { KnowledgeToolbar } from "@/modules/knowledge/components/KnowledgeToolbar";
import { SearchResults } from "@/modules/knowledge/components/SearchResults";
import { parseKnowledgeSearchParams } from "@/modules/knowledge/lib/parseFilters";
import {
	getKnowledgeCategories,
	getKnowledgeOverview,
	getKnowledgeSections,
	searchKnowledgeTopics,
} from "@/payload/services/knowledge.service";
import { baseURL } from "@/resources/content";
import { JsonLd } from "@/shared/components/JsonLd";
import { buildBreadcrumbSchema } from "@/shared/lib/seo/schema";

const TITLE = "База знаний";
const DESCRIPTION =
	"Руководства, инструкции по эксплуатации и разборы по продукции НПО «Полёт»: ручные и стационарные сеткомёты, обслуживание, комплектующие.";

interface KnowledgePageProps {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
	searchParams,
}: KnowledgePageProps): Promise<Metadata> {
	const filters = parseKnowledgeSearchParams(await searchParams);
	const isFiltered = Boolean(filters.q || filters.category || filters.section);

	return {
		title: TITLE,
		description: DESCRIPTION,
		alternates: {
			// Каноникал всегда чистый /knowledge: отфильтрованные состояния — это
			// то же содержимое в другой нарезке, и индексировать их отдельно
			// значит плодить дубли.
			canonical: `${baseURL}/knowledge`,
		},
		// Страница выдачи с параметрами не индексируется: комбинаций
		// запрос × раздел × секция × страница бесконечно много, и ни одна из них
		// не является самостоятельным материалом. Follow остаётся — по ссылкам
		// с такой страницы робот дойдёт до самих статей.
		robots: isFiltered ? { index: false, follow: true } : undefined,
		openGraph: {
			type: "website",
			title: `${TITLE} — НПО Полёт`,
			description: DESCRIPTION,
			url: `${baseURL}/knowledge`,
		},
	};
}

export default async function KnowledgePage({
	searchParams,
}: KnowledgePageProps) {
	const filters = parseKnowledgeSearchParams(await searchParams);
	const isFiltered = Boolean(filters.q || filters.category || filters.section);

	// Обзор нужен всегда: из него берутся счётчики для чипов фильтра. Поиск —
	// только когда он действительно задан, иначе это лишний запрос на каждое
	// открытие страницы.
	const [overview, categories, sections, search] = await Promise.all([
		getKnowledgeOverview(),
		getKnowledgeCategories(),
		getKnowledgeSections(),
		isFiltered
			? searchKnowledgeTopics({
					q: filters.q,
					categorySlug: filters.category,
					sectionSlug: filters.section,
					page: filters.page,
				})
			: Promise.resolve(null),
	]);

	const breadcrumbItems = [{ title: "Главная", href: "/" }, { title: TITLE }];

	// Счётчики берём из уже собранного дерева — отдельных запросов на каждый
	// раздел не делаем (это был бы N+1 ради чисел в чипах).
	const countsByCategory = new Map(
		overview.tree.map(({ category, total }) => [category.id, total]),
	);
	const countsBySection = new Map<number, number>();
	for (const { groups } of overview.tree) {
		for (const group of groups) {
			if (group.section)
				countsBySection.set(group.section.id, group.topics.length);
		}
	}

	const categoryOptions = categories
		.filter((category) => countsByCategory.has(category.id))
		.map((category) => ({
			slug: category.slug,
			title: category.title,
			count: countsByCategory.get(category.id) ?? 0,
		}));

	// Секции показываем только для выбранного раздела: список всех секций всех
	// разделов сразу — это шум, в котором фильтр перестаёт быть фильтром.
	const activeCategory = filters.category
		? categories.find((category) => category.slug === filters.category)
		: undefined;

	const sectionOptions = activeCategory
		? sections
				.filter((section) => {
					const categoryId =
						typeof section.category === "object"
							? section.category.id
							: section.category;
					return (
						categoryId === activeCategory.id && countsBySection.has(section.id)
					);
				})
				.map((section) => ({
					slug: section.slug,
					title: section.title,
					count: countsBySection.get(section.id) ?? 0,
				}))
		: [];

	return (
		<main className="mx-auto flex w-full max-w-5xl flex-col gap-8 !px-4 !py-8 sm:!px-6 sm:!py-10">
			<div className="flex flex-col gap-6">
				<Breadcrumbs items={breadcrumbItems} />
				<JsonLd data={buildBreadcrumbSchema(breadcrumbItems)} />

				<header className="flex flex-col gap-3">
					<h1 className="text-3xl font-semibold tracking-[-0.03em] text-[var(--text-primary)] sm:text-[2.75rem] sm:leading-[1.08]">
						{TITLE}
					</h1>
					<p className="max-w-[52ch] text-base leading-relaxed text-[var(--text-secondary)]">
						{DESCRIPTION}
					</p>
				</header>
			</div>

			{/* useSearchParams внутри тулбара требует границы Suspense — иначе
			    страница целиком выпадает из статического рендера. */}
			<Suspense fallback={<ToolbarSkeleton />}>
				<KnowledgeToolbar
					categories={categoryOptions}
					sections={sectionOptions}
					totalTopics={overview.totalTopics}
					resultCount={search ? search.total : null}
				/>
			</Suspense>

			<div id="knowledge-results">
				{search ? (
					<SearchResults result={search} filters={filters} />
				) : overview.tree.length > 0 ? (
					<KnowledgeBrowse overview={overview} />
				) : (
					<p className="!py-16 text-center text-sm text-[var(--text-secondary)]">
						Материалы появятся здесь, как только их опубликуют.
					</p>
				)}
			</div>
		</main>
	);
}

function ToolbarSkeleton() {
	return (
		<div aria-hidden className="flex flex-col gap-3">
			<div className="h-12 animate-pulse rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]" />
			<div className="flex gap-2">
				{[80, 120, 96].map((width) => (
					<div
						key={width}
						style={{ width }}
						className="h-8 animate-pulse rounded-full border border-[var(--border)] bg-[var(--surface)]"
					/>
				))}
			</div>
		</div>
	);
}
