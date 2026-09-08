"use client";

import { useRowLabel } from "@payloadcms/ui";

/**
 * Подпись строки в массиве вопросов FAQ.
 *
 * Без неё админка подписывает строки как «Вопрос 01», «Вопрос 02» — и найти
 * нужный в теме из полутора десятков вопросов можно только раскрыв все по
 * очереди. Здесь в подписи стоит сам текст вопроса плюс пометки о том, скрыт
 * ли он и вынесен ли на главную.
 */
export function FaqQuestionRowLabel() {
	const { data, rowNumber } = useRowLabel<{
		question?: string;
		isActive?: boolean;
		isFeatured?: boolean;
	}>();

	const index = String((rowNumber ?? 0) + 1).padStart(2, "0");
	const question = data?.question?.trim();

	const marks = [
		data?.isFeatured ? "на главной" : null,
		data?.isActive === false ? "скрыт" : null,
	].filter(Boolean);

	return (
		<span>
			{index}
			{". "}
			{question || "Новый вопрос"}
			{marks.length ? ` — ${marks.join(", ")}` : ""}
		</span>
	);
}
