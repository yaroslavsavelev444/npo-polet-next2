import type { Faq } from "@/payload-types";

/**
 * modules/faq/types
 *
 * Вью-модель FAQ. Она НЕ совпадает с Payload-типом `Faq`: из витрины должны
 * уйти неактивные темы и вопросы, порядок обязан быть уже применён, а ответ
 * нужен и в виде rich-text (для рендера), и в виде простого текста (для
 * разметки FAQPage и для поиска). Вся эта нормализация живёт в lib/mapper.ts —
 * компоненты получают готовые данные и ничего не фильтруют сами.
 */

/** Ответ в формате редактора Lexical, как его отдаёт Payload. */
export type FaqAnswer = NonNullable<
	NonNullable<Faq["questions"]>[number]["answer"]
>;

export interface FaqQuestionView {
	id: string;
	/** Якорь для прямой ссылки: /faq#kak-dostavlyaete */
	slug: string;
	question: string;
	answer: FaqAnswer;
	/**
	 * Тот же ответ простым текстом. Нужен разметке FAQPage (schema.org требует
	 * текст, а не дерево узлов) и поиску по странице.
	 */
	plainAnswer: string;
	isFeatured: boolean;
}

export interface FaqTopicView {
	id: string;
	slug: string;
	title: string;
	description: string | null;
	questions: FaqQuestionView[];
}
