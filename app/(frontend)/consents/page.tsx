// app/(frontend)/consents/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Meta, Schema } from "@once-ui-system/core";
import Link from "next/link";
import {
	byAcceptanceThenTitle,
	ConsentHero,
	ConsentRows,
	type ConsentSummary,
	summarizeConsent,
} from "@/modules/consents";
import styles from "@/modules/consents/components/Consents.module.css";
import { getCachedConsents } from "@/payload/services/consents.service";
import { baseURL } from "@/resources/content";

export async function generateMetadata() {
	// Картинки превью у раздела нет: прежний /og/consents.jpg в проекте не
	// существует (404), а без image Meta.generate подставляет /api/og/generate —
	// такого маршрута тоже нет. Поэтому images из его результата убираем.
	// Canonical Meta.generate проставляет только вместе с hreflang-альтернативами,
	// поэтому задаётся здесь явно — как на остальных публичных страницах.
	const { openGraph, twitter, ...meta } = Meta.generate({
		title: "Соглашения",
		description:
			"Пользовательские соглашения и документы о согласии на обработку данных.",
		baseURL,
		path: "/consents",
	});

	return {
		...meta,
		openGraph: { ...openGraph, images: undefined },
		twitter: { ...twitter, images: undefined },
		alternates: { canonical: `${baseURL}/consents` },
	};
}

interface Group {
	key: string;
	title: string;
	hint: string;
	items: ConsentSummary[];
}

/**
 * Перечень соглашений.
 *
 * Документы разделены на две группы по тому, как они касаются посетителя:
 * одни он принимает отметкой при регистрации (и версия, которую он принял,
 * сохраняется), другие описывают работу магазина и сайта. Это ровно тот
 * вопрос, с которым сюда приходят из формы регистрации: «что именно я
 * подписываю».
 *
 * Отключённые в админке документы (isActive = false) в перечень не
 * попадают: раньше здесь показывалось всё подряд, включая снятые редакции.
 *
 * Полноширинная раскладка — тот же приём, что у контактов и кабинета:
 * .full-bleed возвращает ширину окна, отрицательные поля снимают отступ
 * общего layout витрины.
 */
export default async function ConsentsPage() {
	const { docs } = await getCachedConsents({ isActive: true });
	const now = new Date();
	const items = docs
		.map((consent) => summarizeConsent(consent, now))
		.sort(byAcceptanceThenTitle);

	const groups: Group[] = [
		{
			key: "accept",
			title: "Принимаются при регистрации",
			hint: "Отметки о них ставятся в форме регистрации. Мы сохраняем, какую редакцию вы приняли и когда.",
			items: items.filter((item) => item.needsAcceptance),
		},
		{
			key: "rules",
			title: "Политики и правила",
			hint: "Как работает магазин и как сайт обращается с данными и файлами cookie.",
			items: items.filter((item) => !item.needsAcceptance),
		},
	].filter((group) => group.items.length > 0);

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
				path="/consents"
				title="Соглашения"
				description="Пользовательские соглашения и документы о согласии на обработку данных"
			/>

			<ConsentHero
				variant="index"
				title="Соглашения"
				breadcrumbs={[{ title: "Главная", href: "/" }, { title: "Соглашения" }]}
			>
				<div className={styles.heroGrid}>
					<p className={styles.lead}>
						Условия, на которых мы продаём и доставляем товар, и правила
						обработки персональных данных. Вопрос по документу —{" "}
						<Link href="/contacts" className={styles.link}>
							напишите нам
						</Link>
						.
					</p>
				</div>
			</ConsentHero>

			<div className={`${styles.container} ${styles.index}`}>
				{groups.length === 0 ? (
					<div className={styles.empty}>
						<p className={styles.emptyTitle}>Документы пока не опубликованы.</p>
					</div>
				) : (
					groups.map((group) => (
						<section
							key={group.key}
							className={styles.group}
							aria-labelledby={`group-${group.key}`}
						>
							<div className={styles.groupAside}>
								<h2 id={`group-${group.key}`} className={styles.groupTitle}>
									{group.title}
								</h2>
								<p className={styles.groupHint}>{group.hint}</p>
							</div>
							<ConsentRows items={group.items} />
						</section>
					))
				)}
			</div>
		</div>
	);
}
