import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { GROUP_PREVIEW_SIZE } from "../lib/constants";
import type { KnowledgeOverview } from "../types";
import { TopicRow } from "./TopicRow";

/**
 * Обзор базы знаний: разделы, внутри — секции (если они есть) и материалы.
 *
 * Двухколоночная раскладка на широком экране: слева «где я» (название и
 * описание раздела), справа — содержимое. Так на экране одновременно видно и
 * структуру целиком, и материалы, а не колонка карточек, по которой надо
 * листать, чтобы понять, сколько всего разделов.
 *
 * В группе показываем первые GROUP_PREVIEW_SIZE материалов и ссылку на
 * остальные: обзор обязан оставаться обзором и при двухстах статьях.
 */
export function KnowledgeBrowse({ overview }: { overview: KnowledgeOverview }) {
	const { tree, featured } = overview;

	return (
		<div className="flex flex-col gap-14 sm:gap-16">
			{featured.length > 0 && <FeaturedPanel topics={featured.slice(0, 4)} />}

			{tree.map(({ category, groups, total }, index) => (
				<section
					key={category.id}
					className="reveal-up scroll-mt-[calc(var(--sticky-header-height)+8rem)]"
					id={category.slug}
					style={{
						["--reveal-delay" as string]: `${Math.min(index, 6) * 45}ms`,
					}}
				>
					<div className="grid gap-5 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] md:gap-10">
						<div className="md:pt-1">
							<h2 className="text-lg font-semibold tracking-[-0.015em] text-[var(--text-primary)]">
								<Link
									href={`/knowledge/${category.slug}`}
									className="transition-colors duration-200 hover:text-[var(--primary)] focus-visible:outline-none focus-visible:underline"
								>
									{category.title}
								</Link>
							</h2>

							{category.description && (
								<p className="mt-1.5 text-sm leading-relaxed text-[var(--text-secondary)]">
									{category.description}
								</p>
							)}

							<p className="mt-2 text-xs text-[var(--text-muted)]">
								{total} {pluralize(total)}
							</p>
						</div>

						<div className="flex flex-col gap-7 border-t border-[var(--border)] pt-5 md:border-l md:border-t-0 md:!pl-8 md:pt-0">
							{groups.map((group) => {
								const visible = group.topics.slice(0, GROUP_PREVIEW_SIZE);
								const rest = group.topics.length - visible.length;

								return (
									<div key={group.section?.id ?? "loose"}>
										{group.section && (
											<h3 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
												{group.section.title}
											</h3>
										)}

										<ul>
											{visible.map((topic) => (
												<li key={topic.id}>
													{/* Уровень зависит от того, есть ли над материалом
													    секция: без неё он идёт сразу за разделом (h2),
													    и h4 означал бы пропуск уровня. */}
													<TopicRow
														topic={topic}
														headingLevel={group.section ? 4 : 3}
													/>
												</li>
											))}
										</ul>

										{rest > 0 && (
											<Link
												href={`/knowledge/${category.slug}`}
												className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--accent)] transition-colors hover:text-[var(--accent-hover)]"
											>
												Ещё {rest} {pluralize(rest)}
												<ArrowRight size={14} aria-hidden />
											</Link>
										)}
									</div>
								);
							})}
						</div>
					</div>
				</section>
			))}
		</div>
	);
}

/**
 * Материалы, помеченные редактором как «рекомендуем начать».
 *
 * Одна рамка со строками, а не сетка одинаковых плиток: блок должен читаться
 * как короткий совет в начале страницы, а не как второй, конкурирующий список.
 */
function FeaturedPanel({ topics }: { topics: KnowledgeOverview["featured"] }) {
	return (
		<section className="reveal-up">
			<h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
				<Sparkles size={13} aria-hidden className="text-[var(--primary)]" />С
				чего начать
			</h2>

			<ul className="divide-y divide-[var(--border)] overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]">
				{topics.map((topic) => (
					<li key={topic.id}>
						<TopicRow
							topic={topic}
							showCategory
							className="mx-0 !px-4 rounded-none hover:bg-[var(--surface-secondary)]"
						/>
					</li>
				))}
			</ul>
		</section>
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
