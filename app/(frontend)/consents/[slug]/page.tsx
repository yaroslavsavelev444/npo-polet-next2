// app/(frontend)/consents/[slug]/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Meta, Schema } from "@once-ui-system/core";
import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { BreadcrumbItem } from "@/components/Breadcrumbs/Breadcrumbs";
import {
	byAcceptanceThenTitle,
	ConsentDocument,
	ConsentHero,
	ConsentRows,
	ConsentToc,
	formatServiceDate,
	summarizeConsent,
} from "@/modules/consents";
import styles from "@/modules/consents/components/Consents.module.css";
import {
	getCachedConsentBySlug,
	getCachedConsents,
} from "@/payload/services/consents.service";
import { baseURL } from "@/resources/content";
import { JsonLd } from "@/shared/components/JsonLd";
import { buildBreadcrumbSchema } from "@/shared/lib/seo/schema";
import { cn } from "@/utils/cn";

type ConsentPageProps = {
	params: Promise<{ slug: string }>;
};

export async function generateMetadata({
	params,
}: ConsentPageProps): Promise<Metadata> {
	const { slug } = await params;
	const consent = await getCachedConsentBySlug(slug);

	if (!consent) {
		return { title: "Соглашение не найдено" };
	}

	// Картинки превью у раздела нет: прежний /og/consents.jpg в проекте не
	// существует (404), а без image Meta.generate подставляет /api/og/generate —
	// такого маршрута тоже нет. Поэтому images из его результата убираем.
	// Canonical Meta.generate проставляет только вместе с hreflang-альтернативами,
	// поэтому задаётся здесь явно — как на остальных публичных страницах.
	const { openGraph, twitter, ...meta } = Meta.generate({
		title: consent.title,
		description: consent.description || consent.title,
		baseURL,
		path: `/consents/${slug}`,
	});

	return {
		...meta,
		openGraph: { ...openGraph, images: undefined },
		twitter: { ...twitter, images: undefined },
		alternates: { canonical: `${baseURL}/consents/${slug}` },
	};
}

/**
 * Страница соглашения.
 *
 * Сюда приходят двумя путями: из перечня /consents и из формы регистрации,
 * где у каждой отметки стоит ссылка на документ. Второй путь важнее: человек
 * решает, ставить ли галочку, — поэтому первый экран отвечает на вопросы
 * «какая это редакция и действует ли она», а сам текст разбит на разделы с
 * оглавлением, чтобы найти пункт о возврате или о сроке хранения данных, не
 * читая всё подряд.
 *
 * Оригинал (файл на Яндекс Диске из поля documentUrl) — вторичное действие:
 * читать документ нужно здесь, а файл — для тех, кому нужна копия.
 */
export default async function ConsentPage({ params }: ConsentPageProps) {
	const { slug } = await params;
	const [consent, { docs }] = await Promise.all([
		getCachedConsentBySlug(slug),
		getCachedConsents({ isActive: true }),
	]);

	if (!consent) {
		return notFound();
	}

	const now = new Date();
	const summary = summarizeConsent(consent, now);
	const { parsed } = summary;
	const others = docs
		.map((doc) => summarizeConsent(doc, now))
		.sort(byAcceptanceThenTitle);

	const breadcrumbItems: BreadcrumbItem[] = [
		{ title: "Главная", href: "/" },
		{ title: "Соглашения", href: "/consents" },
		{ title: consent.title },
	];

	// Реквизиты редакции. Что не удалось прочитать из шапки документа, не
	// выдумывается: остаётся служебная дата изменения.
	const facts: Array<{ label: string; value: string }> = [];
	if (summary.edition) {
		facts.push({
			label: "Редакция",
			value: summary.edition.replace(/^\S+\s/, ""),
		});
	}
	if (parsed.published) {
		facts.push({ label: "Опубликован", value: parsed.published });
	}
	if (parsed.effective) {
		facts.push({
			label: summary.upcoming ? "Вступает в силу" : "Действует с",
			value: parsed.effective,
		});
	}
	if (!parsed.published && !parsed.effective) {
		const updated = formatServiceDate(
			consent.lastUpdatedAt ?? consent.updatedAt,
		);
		if (updated) facts.push({ label: "Обновлён", value: updated });
	}

	return (
		<div
			className="full-bleed"
			style={{
				marginTop: "calc(-1 * var(--responsive-space-l))",
				marginBottom: "calc(-1 * var(--responsive-space-l))",
			}}
		>
			<Schema
				as="webPage"
				baseURL={baseURL}
				path={`/consents/${slug}`}
				title={consent.title}
				description={consent.description || consent.title}
			/>
			<JsonLd
				data={buildBreadcrumbSchema(
					breadcrumbItems.map((item) => ({
						title: String(item.title),
						href: item.href,
					})),
				)}
			/>

			<ConsentHero
				variant="document"
				title={consent.title}
				breadcrumbs={breadcrumbItems}
			>
				<div className={styles.heroGrid}>
					<div>
						{(parsed.fullTitle || consent.description) && (
							<p className={styles.lead}>
								{parsed.fullTitle || consent.description}
							</p>
						)}

						{facts.length > 0 && (
							<dl className={styles.facts}>
								{facts.map((fact) => (
									<div key={fact.label} className={styles.fact}>
										<dt className={styles.factLabel}>{fact.label}</dt>
										<dd className={styles.factValue}>{fact.value}</dd>
									</div>
								))}
							</dl>
						)}
					</div>

					{consent.documentUrl && (
						<div className={styles.heroActions}>
							<a
								href={consent.documentUrl}
								target="_blank"
								rel="noopener noreferrer"
								className={cn(styles.button, styles.buttonQuiet)}
							>
								<Download size={16} aria-hidden />
								Скачать оригинал
								<span className="sr-only"> (откроется в новой вкладке)</span>
							</a>
						</div>
					)}
				</div>
			</ConsentHero>

			<div
				className={cn(
					styles.container,
					styles.docLayout,
					parsed.sections.length < 2 && styles.docLayoutSingle,
				)}
			>
				{parsed.sections.length >= 2 && (
					<ConsentToc sections={parsed.sections} />
				)}
				<ConsentDocument blocks={parsed.blocks} />
			</div>

			{others.length > 1 && (
				<section className={styles.after} aria-labelledby="other-consents">
					<div className={cn(styles.container, styles.afterInner)}>
						<div className={styles.groupAside}>
							<h2 id="other-consents" className={styles.groupTitle}>
								Все документы
							</h2>
							<p className={styles.groupHint}>
								Остались вопросы по документу —{" "}
								<Link href="/contacts" className={styles.link}>
									напишите нам
								</Link>
								.
							</p>
						</div>
						<ConsentRows items={others} currentSlug={slug} />
					</div>
				</section>
			)}
		</div>
	);
}
