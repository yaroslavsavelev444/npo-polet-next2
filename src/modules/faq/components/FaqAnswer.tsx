import { RichText } from "@payloadcms/richtext-lexical/react";
import type { FaqAnswer as FaqAnswerData } from "../types";

/**
 * Тело ответа.
 *
 * Типографика берётся из .knowledge-prose — того же набора prose-стилей, что и
 * у статей базы знаний. Заводить второй набор ради FAQ значило бы получить два
 * разных вида у абзаца, списка и ссылки на одном сайте; .faq-prose ниже лишь
 * подстраивает кегль и отступы под более компактный контекст аккордеона.
 *
 * Конвертеры не передаются: в ответе на вопрос нужны абзац, список, ссылка и
 * выделение — всё это умеют штатные конвертеры библиотеки. Расширенный набор
 * из базы знаний (заголовки с якорями, врезки, видео) здесь был бы лишним
 * весом.
 */
export function FaqAnswer({ answer }: { answer: FaqAnswerData }) {
	if (!answer) return null;

	return (
		<div className="knowledge-prose faq-prose">
			<RichText data={answer} disableContainer />
		</div>
	);
}
