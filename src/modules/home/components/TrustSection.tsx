import { ArrowRight, FileText, Star } from "lucide-react";
import Link from "next/link";
import type { HomepageReview } from "@/payload/services/reviews.service";
import { Reveal } from "@/shared/components/motion/Reveal";
import { trust } from "../content/home-content";
import { Container, Placeholder, Section } from "./primitives";

/**
 * Доверие: документы, отзывы, география.
 *
 * Три разных типа доказательства рядом — намеренно. Частному покупателю
 * убедительнее чужой отзыв, снабженцу организации — протокол испытаний, и
 * заранее неизвестно, кто из них сейчас на странице. Один вид доказательства
 * убедил бы половину аудитории.
 *
 * Отзывы здесь настоящие — из коллекции product-reviews, только одобренные
 * модерацией. Пока их нет, колонка честно об этом сообщает, а не показывает
 * выдуманные.
 */
export function TrustSection({ reviews }: { reviews: HomepageReview[] }) {
	return (
		<Section id="trust" className="py-[clamp(4.5rem,9vw,9rem)]">
			<Container>
				<Reveal>
					<h2 className="mb-[clamp(2.5rem,5vw,4rem)] text-[clamp(1.75rem,1.1rem+2.6vw,3.25rem)] font-bold tracking-[-0.025em] text-[var(--text-primary)]">
						{trust.title}
					</h2>
				</Reveal>

				<div className="grid gap-px bg-[var(--rule)] lg:grid-cols-3">
					{/* ── Документы ─────────────────────────────────────────── */}
					<Reveal className="bg-[var(--background)] p-[clamp(1.5rem,2.5vw,2rem)]">
						<TrustColumnHead
							title={trust.documents.title}
							lead={trust.documents.lead}
						/>
						<ul className="mt-6 flex list-none flex-col gap-2 p-0">
							{trust.documents.items.map((doc) => (
								<li
									key={doc.title}
									className="flex items-center gap-3 border-b border-[var(--hairline)] py-3 last:border-b-0"
								>
									<FileText
										className="size-4 shrink-0 text-[var(--text-muted)]"
										aria-hidden="true"
									/>
									<span className="flex-1 text-[0.9375rem] text-[var(--text-secondary)]">
										<Placeholder note={trust.documents.note}>
											{doc.title}
										</Placeholder>
									</span>
									<span className="u-mono shrink-0 text-[0.625rem] text-[var(--text-muted)]">
										{doc.meta}
									</span>
								</li>
							))}
						</ul>
					</Reveal>

					{/* ── Отзывы ────────────────────────────────────────────── */}
					<Reveal
						delay={110}
						className="bg-[var(--background)] p-[clamp(1.5rem,2.5vw,2rem)]"
					>
						<TrustColumnHead
							title={trust.reviews.title}
							lead={trust.reviews.lead}
						/>

						{reviews.length === 0 ? (
							<p className="mt-6 text-[0.875rem] text-[var(--text-muted)]">
								{trust.reviews.emptyMessage}
							</p>
						) : (
							<ul className="mt-6 flex list-none flex-col gap-5 p-0">
								{reviews.map((review) => (
									<li
										key={review.id}
										className="flex flex-col gap-2 border-b border-[var(--hairline)] pb-5 last:border-b-0 last:pb-0"
									>
										<Rating value={review.rating} />
										<p className="line-clamp-3 text-[0.9375rem] leading-[1.6] text-[var(--text-secondary)]">
											{review.comment}
										</p>
										<p className="text-[0.8125rem] text-[var(--text-muted)]">
											{review.authorName}
											{review.productTitle ? (
												<>
													{" · "}
													{review.productHref ? (
														<Link
															href={review.productHref}
															className="text-[var(--text-muted)] underline decoration-[var(--rule)] underline-offset-4 transition-colors hover:text-[var(--text-secondary)]"
														>
															{review.productTitle}
														</Link>
													) : (
														review.productTitle
													)}
												</>
											) : null}
										</p>
									</li>
								))}
							</ul>
						)}

						<Link
							href={trust.reviews.cta.href}
							className="group mt-6 inline-flex items-center gap-2 text-[0.875rem] font-medium text-[var(--text-primary)] no-underline"
						>
							<span className="border-b border-[var(--rule)] pb-0.5 transition-colors duration-200 group-hover:border-[var(--primary)]">
								{trust.reviews.cta.label}
							</span>
							<ArrowRight
								className="size-3.5 transition-transform duration-200 group-hover:translate-x-1"
								aria-hidden="true"
							/>
						</Link>
					</Reveal>

					{/* ── География ─────────────────────────────────────────── */}
					<Reveal
						delay={220}
						className="bg-[var(--background)] p-[clamp(1.5rem,2.5vw,2rem)]"
					>
						<TrustColumnHead
							title={trust.geography.title}
							lead={
								<Placeholder
									active={trust.geography.placeholder}
									note="Реальный охват поставок"
								>
									{trust.geography.lead}
								</Placeholder>
							}
						/>
						<div className="mt-6">
							<CoverageChart />
						</div>
					</Reveal>
				</div>
			</Container>
		</Section>
	);
}

function TrustColumnHead({
	title,
	lead,
}: {
	title: string;
	lead: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-2">
			<h3 className="text-[1.125rem] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
				{title}
			</h3>
			<p className="text-[0.875rem] leading-[1.6] text-[var(--text-muted)]">
				{lead}
			</p>
		</div>
	);
}

function Rating({ value }: { value: number }) {
	const rounded = Math.round(value);
	return (
		// role="img" — потому что смысл несёт не набор звёзд, а их количество:
		// скринридер должен прочитать «Оценка 4 из 5», а не пять графических
		// элементов подряд. Без роли aria-label на span игнорируется.
		<span
			role="img"
			className="flex items-center gap-0.5"
			aria-label={`Оценка ${rounded} из 5`}
		>
			{Array.from({ length: 5 }, (_, index) => (
				<Star
					key={index}
					aria-hidden="true"
					className={
						index < rounded
							? "size-3.5 fill-[var(--primary)] text-[var(--primary)]"
							: "size-3.5 text-[var(--rule)]"
					}
				/>
			))}
		</span>
	);
}

/**
 * Схема охвата: столбцы вместо карты.
 *
 * Карта России в этом блоке была бы декорацией — без реальных координат
 * поставок она не сообщает ничего, кроме «мы в России». Столбчатая шкала
 * честно показывает то немногое, что известно, и сразу читается как
 * временная: заменить её реальными числами — правка одного массива.
 */
function CoverageChart() {
	// Значения условные — заменяются вместе с trust.geography.
	const rows = [
		{ label: "Центральный", share: 0.86 },
		{ label: "Приволжский", share: 0.62 },
		{ label: "Южный", share: 0.48 },
		{ label: "Северо-Западный", share: 0.4 },
		{ label: "Прочие", share: 0.26 },
	];

	return (
		<ul className="flex list-none flex-col gap-2.5 p-0" aria-hidden="true">
			{rows.map((row) => (
				<li key={row.label} className="flex items-center gap-3">
					<span className="w-[8.5rem] shrink-0 text-[0.75rem] text-[var(--text-muted)]">
						{row.label}
					</span>
					<span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--rule)]">
						<span
							className="block h-full rounded-full bg-[color-mix(in_srgb,var(--primary)_70%,transparent)]"
							style={{ width: `${row.share * 100}%` }}
						/>
					</span>
				</li>
			))}
		</ul>
	);
}
