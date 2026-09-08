import type { Metadata } from "next";
import Link from "next/link";
import {
	buildFaqPageSchema,
	countQuestions,
	FaqBrowser,
	FaqNoScriptStyles,
	mapFaqTopics,
} from "@/modules/faq";
import { getCachedFaqTopics } from "@/payload/services/faq.service";
import { baseURL } from "@/resources/content";
import { JsonLd } from "@/shared/components/JsonLd";

const PAGE_PATH = "/faq";
const PAGE_URL = `${baseURL}${PAGE_PATH}`;

export const metadata: Metadata = {
	title: "Вопросы и ответы — НПО «Полёт»",
	description:
		"Ответы на частые вопросы о сеткомётах «Паук», стационарных установках и комплексах противодействия БПЛА: применение, покупка, доставка, обслуживание.",
	alternates: { canonical: PAGE_URL },
	openGraph: {
		title: "Вопросы и ответы — НПО «Полёт»",
		description:
			"Ответы на частые вопросы о средствах перехвата беспилотников: применение, покупка, доставка, обслуживание.",
		url: PAGE_URL,
		type: "website",
	},
};

/**
 * Страница вопросов и ответов.
 *
 * Продолжение блока FAQ с главной, а не отдельная система: тот же аккордеон,
 * та же анимация раскрытия, та же типографика (см. modules/faq). Отличий два,
 * и оба продиктованы задачей:
 *  — здесь есть поиск, потому что вопросов десятки;
 *  — раскрывать можно несколько ответов сразу, потому что сюда приходят
 *    сравнивать, а не читать по одному.
 *
 * Разметка FAQPage стоит ТОЛЬКО здесь: на главной FAQ неполон, и две страницы
 * с одинаковой разметкой по одной теме конкурировали бы в выдаче.
 *
 * Все ответы находятся в DOM независимо от того, раскрыт пункт или нет, —
 * этого требует и Google (текст в разметке обязан совпадать с видимым на
 * странице), и поиск браузера по странице.
 */
export default async function FaqPage() {
	const topics = mapFaqTopics(await getCachedFaqTopics());
	const total = countQuestions(topics);
	const schema = buildFaqPageSchema(topics, PAGE_URL);

	return (
		<div className="w-full max-w-[80rem] px-[0.25rem] py-[clamp(2rem,5vw,4rem)]">
			{schema ? <JsonLd data={schema} /> : null}
			<FaqNoScriptStyles />

			<header className="mb-[clamp(2.5rem,5vw,4.5rem)] flex flex-col gap-5">
				<h1 className="u-display text-[clamp(2.25rem,1.2rem+4vw,5.5rem)] text-[var(--text-primary)]">
					Вопросы
				</h1>
				<p className="max-w-[56ch] text-[clamp(0.9375rem,0.88rem+0.35vw,1.125rem)] leading-relaxed text-[var(--text-secondary)]">
					Всё, что чаще всего спрашивают о наших изделиях — от принципа работы
					до доставки. Не нашли ответ —{" "}
					<Link
						href="/contacts"
						className="text-[var(--accent)] underline decoration-[color-mix(in_srgb,var(--accent)_45%,transparent)] underline-offset-4 transition-colors hover:text-[var(--accent-hover)] hover:decoration-current"
					>
						напишите нам
					</Link>
					, ответим и добавим сюда.
				</p>
			</header>

			{total === 0 ? (
				<div className="border-t border-[var(--rule)] py-[clamp(3rem,8vw,6rem)]">
					<p className="text-[1.0625rem] text-[var(--text-secondary)]">
						Вопросы пока не заполнены.
					</p>
					<p className="mt-2 text-[0.9375rem] text-[var(--text-muted)]">
						Администратор добавляет их в админке: раздел «Контент» → FAQ.
					</p>
				</div>
			) : (
				<FaqBrowser topics={topics} />
			)}
		</div>
	);
}
